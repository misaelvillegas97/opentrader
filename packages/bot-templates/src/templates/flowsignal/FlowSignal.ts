import { z } from "zod";
import {
  cancelSmartTrade,
  IBotConfiguration,
  SmartTradeService,
  TBotContext,
  useIndicators,
  useSmartTrade,
} from "@opentrader/bot-processor";
import { logger } from "@opentrader/logger";
import { FlowSignalConfig } from "./config/flowsignal.config.js";
import { DeltaCalculator } from "./flow/DeltaCalculator.js";
import { Candle, SwingDetector } from "./structure/SwingDetector.js";
import { AbsorptionDetector } from "./flow/AbsorptionDetector.js";
import { StructureValidator } from "./structure/StructureValidator.js";
import { FlowSignalDetector } from "./signal/FlowSignalDetector.js";
import { SessionFilter } from "./context/SessionFilter.js";
import { VolatilityFilter } from "./context/VolatilityFilter.js";
import { LiquidityContext } from "./context/LiquidityContext.js";
import { EntryPlanner } from "./entry/EntryPlanner.js";

// Risk Engine imports
import { MarketContext, RiskConfig, RiskEngine, RiskInput, TradeState, VolatilityData } from "./risk/index.js";

export function* flowSignal(ctx: TBotContext<FlowSignalParams, FlowSignalState>) {
  const {
    config: { settings: params },
    state,
    onStart,
    onStop,
  } = ctx;

  // Handle bot start
  if (onStart) {
    logger.info(`[FlowSignal] Bot strategy started on ${params.symbol} pair`);
    return;
  }

  // Handle bot stop - cancel all active smart trades
  if (onStop) {
    logger.info("[FlowSignal] Bot stopping, canceling active trades...");
    if (state.tradeCounter) {
      for (let i = 0; i < state.tradeCounter; i++) {
        yield cancelSmartTrade(`flowsignal-${i}`);
      }
    }
    logger.info("[FlowSignal] Bot stopped");
    return;
  }

  // Initialize components in state if not present
  if (!state.initialized) {
    state.deltaCalculator = new DeltaCalculator();
    state.swingDetector = new SwingDetector();

    // AbsorptionDetector con scores según PRD sección 7
    state.absorptionDetector = new AbsorptionDetector(
      params.deltaExtremePercentile ?? FlowSignalConfig.deltaExtremePercentile,
      params.minAbsorptionScore ?? FlowSignalConfig.minAbsorptionScore,
      params.minFailScore ?? FlowSignalConfig.minFailScore,
    );

    state.structureValidator = new StructureValidator();

    // FlowSignalDetector con cooldown y ttlMs según PRD sección 7
    state.signalDetector = new FlowSignalDetector(
      state.absorptionDetector,
      state.structureValidator,
      params.cooldownMs ?? FlowSignalConfig.cooldownMs,
      params.ttlMs ?? FlowSignalConfig.ttlMs,
    );

    // SessionFilter con tipo correcto (incluye ASIA)
    const tickSize = params.tickSize ?? RiskConfig.tickSize;
    state.sessionFilter = new SessionFilter(params.sessions ?? FlowSignalConfig.sessions);
    state.volatilityFilter = new VolatilityFilter(
      params.minRangeTicks ?? FlowSignalConfig.minRangeTicks,
      tickSize,
    );
    state.liquidityContext = new LiquidityContext();
    state.entryPlanner = new EntryPlanner();

    // Initialize Risk Engine with complete config según PRD
    state.riskEngine = new RiskEngine({
      config: {
        // Parámetros de riesgo base
        maxRiskPerTradePct: params.maxRiskPerTradePct ?? RiskConfig.maxRiskPerTradePct,
        maxDailyLossPct: params.maxDailyLossPct ?? RiskConfig.maxDailyLossPct,
        minRR: params.minRR ?? RiskConfig.minRR,
        targetRR: params.targetRR ?? RiskConfig.targetRR,
        initialCapital: params.initialCapital ?? RiskConfig.initialCapital,
        tickSize,
        maxTradesPerSession: params.maxTradesPerSession ?? RiskConfig.maxTradesPerSession,
        // Parámetros de spread (PRD 4.2)
        maxSpreadTicks: params.maxSpreadTicks ?? RiskConfig.maxSpreadTicks,
        // Parámetros de parciales (PRD 5.2B)
        partials: params.partials ?? RiskConfig.partials,
        // Parámetros de trailing (PRD 5.2C)
        trailingMode: params.trailingMode ?? RiskConfig.trailingMode,
        trailingMinStepTicks: params.trailingMinStepTicks ?? RiskConfig.trailingMinStepTicks,
        // Parámetros de invalidación (PRD 5.2D/E)
        structuralBreakInvalidation: params.structuralBreakInvalidation ?? RiskConfig.structuralBreakInvalidation,
        timeStopMs: params.timeStopMs ?? RiskConfig.timeStopMs,
      },
    });

    state.activeTrades = new Map();
    state.tradeCounter = 0;
    state.initialized = true;
    logger.info("[FlowSignal] Strategy initialized with Risk Engine (PRD compliant)");
  }

  // Handle public trades for delta calculation
  if (ctx.onPublicTrade && ctx.market.trade) {
    state.deltaCalculator.addTrade(ctx.market.trade as any);

    // Update active trades with current price for BE/trailing/invalidation
    if (state.activeTrades.size > 0) {
      const currentPrice = ctx.market.trade.price;
      const currentDelta = state.deltaCalculator.getCurrentDelta();
      const deltaPercentile = state.deltaCalculator.getPercentile(currentDelta);

      for (const [tradeId, tradeState] of state.activeTrades) {
        const marketContext: MarketContext = {
          currentPrice,
          delta: currentDelta,
          deltaPercentile,
        };

        const events = state.riskEngine.updateTrade(tradeId, marketContext);

        for (const event of events) {
          logger.info(event, `[FlowSignal] Trade event: ${event.type}`);

          // Handle partial exits (PRD 5.2B)
          if (event.type === "PARTIAL_EXIT") {
            logger.info(
              `[FlowSignal] Partial exit: ${event.partialFraction! * 100}% at ${event.rMultipleAtEvent?.toFixed(2)}R`,
            );
            // TODO: Execute partial close via SmartTrade when supported
          }

          // If trade closed, remove from active trades
          if (
            event.type === "TP_HIT" ||
            event.type === "SL_HIT" ||
            event.type === "INVALIDATION" ||
            event.type === "TIME_STOP" // PRD 5.2E
          ) {
            logger.info(`[FlowSignal] Trade ${tradeId} closed: ${event.reason}`);
            state.activeTrades.delete(tradeId);
          }
        }
      }
    }
    return;
  }

  if (!ctx.onCandleClosed) return;

  const currentDelta = state.deltaCalculator.onCandleClosed();

  const { candles }: { candles: Candle[] } = yield useIndicators({
    candles: {
      on: params.symbol,
      timeframe: params.timeframe,
    },
  });

  if (candles.length < 3) return;

  // Update components
  state.swingDetector.update(candles);

  const lastCandle = candles[candles.length - 1];
  const priceChange = lastCandle.close - lastCandle.open;
  const volume = lastCandle.volume || 0;
  const minDeltaSamples = 10;
  let effectiveDelta = currentDelta;

  if (!state.deltaCalculator.hasSufficientHistory(minDeltaSamples)) {
    if (currentDelta === 0) {
      effectiveDelta = volume * priceChange;
      logger.info(
        `[FlowSignal] Delta history insufficient; using candle-based delta ${effectiveDelta.toFixed(2)} for signal detection`,
      );
    } else {
      logger.info(
        "[FlowSignal] Delta history insufficient; using current candle delta for signal detection",
      );
    }
  }

  // Context Filters
  if (!state.sessionFilter.isValid(Date.now())) return;
  if (!state.volatilityFilter.isValid(candles)) return;

  // Signal Detection
  const signal = state.signalDetector.detect(
    lastCandle.close,
    effectiveDelta,
    state.deltaCalculator,
    state.swingDetector,
    volume,
    priceChange,
  );

  if (signal) {
    logger.info(signal, "[FlowSignal] Signal detected");

    // Convert FlowSignal to RiskInput
    const riskInput: RiskInput = {
      direction: signal.direction,
      entryPrice: signal.entryPlan.price,
      structureLevel: signal.structureLevel,
      liquidityTarget: signal.liquidityTarget,
      confidence: signal.confidence,
      timestamp: signal.timestamp,
    };

    // Calculate volatility data from recent candles
    const volatilityData: VolatilityData = calculateVolatility(candles, params.tickSize ?? RiskConfig.tickSize);

    // Evaluate signal with Risk Engine
    const evaluation = state.riskEngine.evaluate(riskInput, volatilityData);
    const decision = evaluation.decision;

    if (!decision.approved) {
      logger.info({ reason: decision.reason }, "[FlowSignal] Trade rejected by Risk Engine");
      return;
    }

    logger.info(
      {
        size: decision.size,
        stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit,
        rr: decision.rr,
      },
      "[FlowSignal] Trade approved by Risk Engine",
    );

    // Register trade for post-entry management
    const tradeState = state.riskEngine.registerTrade(riskInput, decision);
    if (tradeState) {
      state.activeTrades.set(tradeState.id, tradeState);
    }

    // Generate unique trade reference
    const tradeRef = `flowsignal-${state.tradeCounter}`;
    state.tradeCounter++;

    // Execute trade with SmartTrade including TP and SL
    const isLong = signal.direction === "LONG";

    const smartTrade: SmartTradeService = yield useSmartTrade(
      {
        entry: {
          type: "Limit",
          side: isLong ? "Buy" : "Sell",
          price: signal.entryPlan.price,
        },
        tp: {
          type: "Limit",
          side: isLong ? "Sell" : "Buy",
          price: decision.takeProfit,
        },
        sl: {
          type: "Market",
          side: isLong ? "Sell" : "Buy",
          stopPrice: decision.stopLoss,
        },
        quantity: decision.size,
      },
      tradeRef,
    );

    logger.info(
      {
        ref: tradeRef,
        direction: signal.direction,
        entry: signal.entryPlan.price,
        tp: decision.takeProfit,
        sl: decision.stopLoss,
        quantity: decision.size,
      },
      "[FlowSignal] SmartTrade created with TP and SL",
    );

    // Mark trade as open
    if (tradeState) {
      state.riskEngine.openTrade(tradeState.id);
    }

    // Check if trade completed (TP or SL hit)
    if (smartTrade.isCompleted()) {
      logger.info({ ref: tradeRef }, "[FlowSignal] SmartTrade completed");
      if (tradeState) {
        state.activeTrades.delete(tradeState.id);
      }
    }
  }
}

/**
 * Calculate volatility data from recent candles
 */
function calculateVolatility(candles: Candle[], tickSize: number): VolatilityData {
  const recentCandles = candles.slice(-20);

  if (recentCandles.length < 2) {
    return {
      sigmaTicks: 2,
      recentRange: tickSize * 20,
    };
  }

  // Calculate ATR-like measure
  const ranges = recentCandles.map((c) => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

  // Calculate standard deviation of closes
  const closes = recentCandles.map((c) => c.close);
  const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - avgClose, 2), 0) / closes.length;
  const stdDev = Math.sqrt(variance);

  return {
    sigmaTicks: Math.max(2, stdDev / tickSize),
    atr: avgRange,
    recentRange: avgRange,
  };
}

flowSignal.displayName = "FlowSignal Strategy";
flowSignal.schema = z.object({
  // ============================================
  // Strategy params
  // ============================================
  symbol: z.string(),
  timeframe: z.string().default("1m"),
  quantity: z.number().positive().optional().describe("Legacy quantity (overridden by Risk Engine sizing)"),

  // Session and context (PRD 2.1)
  sessions: z
    .array(z.enum(["NY", "LDN", "ASIA"]))
    .default(FlowSignalConfig.sessions)
    .describe("Trading sessions to enable"),
  minRangeTicks: z.number().default(FlowSignalConfig.minRangeTicks).describe("Minimum range in ticks for volatility"),

  // ============================================
  // Signal detection params (PRD section 7)
  // ============================================
  deltaExtremePercentile: z
    .number()
    .default(FlowSignalConfig.deltaExtremePercentile)
    .describe("Percentile for extreme delta"),
  minAbsorptionScore: z
    .number()
    .min(0)
    .max(1)
    .default(FlowSignalConfig.minAbsorptionScore)
    .describe("Min absorption score (0..1)"),
  minFailScore: z
    .number()
    .min(0)
    .max(1)
    .default(FlowSignalConfig.minFailScore)
    .describe("Min continuation fail score (0..1)"),
  cooldownMs: z.number().default(FlowSignalConfig.cooldownMs).describe("Cooldown between signals (ms)"),
  ttlMs: z.number().default(FlowSignalConfig.ttlMs).describe("Signal time-to-live (ms)"),

  // ============================================
  // Risk Engine params (PRD section 4)
  // ============================================
  maxRiskPerTradePct: z.number().default(RiskConfig.maxRiskPerTradePct).describe("Max risk per trade (% of capital)"),
  maxDailyLossPct: z.number().default(RiskConfig.maxDailyLossPct).describe("Max daily loss (% of capital)"),
  minRR: z.number().default(RiskConfig.minRR).describe("Minimum risk/reward ratio"),
  targetRR: z.number().default(RiskConfig.targetRR).describe("Target risk/reward ratio"),
  initialCapital: z.number().default(RiskConfig.initialCapital).describe("Initial capital for position sizing"),
  tickSize: z.number().default(RiskConfig.tickSize).describe("Tick size for the instrument"),
  maxTradesPerSession: z.number().default(RiskConfig.maxTradesPerSession).describe("Max trades per session"),
  maxSpreadTicks: z.number().default(RiskConfig.maxSpreadTicks).describe("Max spread in ticks (PRD 4.2)"),

  // ============================================
  // Trade management params (PRD section 5)
  // ============================================
  // Partials (PRD 5.2B)
  partials: z
    .array(
      z.object({
        atR: z.number().describe("R-multiple to trigger partial"),
        fraction: z.number().min(0).max(1).describe("Fraction to close (0..1)"),
      }),
    )
    .default(RiskConfig.partials)
    .describe("Partial exit configuration"),

  // Trailing (PRD 5.2C)
  trailingMode: z.enum(["STRUCTURAL", "FIXED"]).default(RiskConfig.trailingMode).describe("Trailing stop mode"),
  trailingMinStepTicks: z.number().default(RiskConfig.trailingMinStepTicks).describe("Min step for trailing (ticks)"),

  // Invalidation (PRD 5.2D/E)
  structuralBreakInvalidation: z
    .boolean()
    .default(RiskConfig.structuralBreakInvalidation)
    .describe("Close on structural break"),
  timeStopMs: z.number().default(RiskConfig.timeStopMs).describe("Time stop - close if no advance (ms)"),
});

flowSignal.runPolicy = {
  onCandleClosed: true,
  onPublicTrade: true,
  onTradeCompleted: true,
};

flowSignal.timeframe = ({ timeframe }: IBotConfiguration) => timeframe;

flowSignal.watchers = {
  watchCandles: ({ symbol }: FlowSignalParams) => symbol,
  watchTrades: ({ symbol }: FlowSignalParams) => symbol,
};

type FlowSignalState = {
  initialized: boolean;
  deltaCalculator: DeltaCalculator;
  swingDetector: SwingDetector;
  absorptionDetector: AbsorptionDetector;
  structureValidator: StructureValidator;
  signalDetector: FlowSignalDetector;
  sessionFilter: SessionFilter;
  volatilityFilter: VolatilityFilter;
  liquidityContext: LiquidityContext;
  entryPlanner: EntryPlanner;
  // Risk Engine
  riskEngine: RiskEngine;
  activeTrades: Map<string, TradeState>;
  // SmartTrade counter for unique references
  tradeCounter: number;
};

export type FlowSignalParams = IBotConfiguration<z.infer<typeof flowSignal.schema>>;
