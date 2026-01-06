/**
 * RiskEngine - Motor de Riesgo Principal
 *
 * Orquesta todos los componentes del sistema de riesgo:
 * - RiskValidator: Validación previa de trades
 * - StructuralStopLoss: Cálculo de SL estructural
 * - LiquidityTakeProfit: Cálculo de TP lógico
 * - FixedFractionalSizer: Tamaño de posición
 * - TradeManager: Gestión post-entry
 *
 * ⚠️ Nunca genera señales. Opera solo sobre señales válidas.
 *
 * Principios de diseño:
 * - Riesgo primero, señal después
 * - Pérdidas pequeñas, ganancias grandes
 * - Separación estricta: Strategy ≠ Risk ≠ Execution
 * - Decisiones determinísticas y auditables
 */

import {
  ManagementConfig,
  OrderConfig,
  RiskDecision,
  RiskInput,
  RiskMetrics,
  RiskMetricsDecision,
  TradeState,
  TradeUpdateEvent,
  VolatilityData,
} from "./types.js";
import { RiskConfig, RiskConfigType } from "./config/risk.config.js";
import { RiskValidator } from "./validator/RiskValidator.js";
import { StopLossResult, StructuralStopLoss } from "./stoploss/StructuralStopLoss.js";
import { LiquidityTakeProfit, TakeProfitResult } from "./takeprofit/LiquidityTakeProfit.js";
import { FixedFractionalSizer, SizingOptions, SizingResult } from "./sizing/FixedFractionalSizer.js";
import { MarketContext, TradeManager, TradeManagerOptions } from "./management/TradeManager.js";

export interface RiskEngineOptions {
  /** Configuración de riesgo */
  config?: Partial<RiskConfigType>;

  /** Opciones de sizing */
  sizingOptions?: SizingOptions;

  /** Opciones del TradeManager */
  tradeManagerOptions?: TradeManagerOptions;
}

export interface EvaluationResult {
  /** Decisión final del Risk Engine */
  decision: RiskDecision;

  /** Resultado del cálculo de SL */
  stopLossResult: StopLossResult;

  /** Resultado del cálculo de TP */
  takeProfitResult: TakeProfitResult;

  /** Resultado del sizing */
  sizingResult: SizingResult;

  /** Detalles de la evaluación */
  details: {
    validationPassed: boolean;
    validationReason?: string;
    rrMeetsMinimum: boolean;
    confidenceAdjusted: boolean;
  };
}

export class RiskEngine {
  private config: RiskConfigType;
  private validator: RiskValidator;
  private stopLossCalculator: StructuralStopLoss;
  private takeProfitCalculator: LiquidityTakeProfit;
  private positionSizer: FixedFractionalSizer;
  private tradeManager: TradeManager;

  private currentCapital: number;
  private sizingOptions: SizingOptions;

  constructor(options: RiskEngineOptions = {}) {
    this.config = { ...RiskConfig, ...options.config };
    this.currentCapital = this.config.initialCapital;
    this.sizingOptions = options.sizingOptions || {};

    // Inicializar componentes
    this.validator = new RiskValidator(this.config);
    this.stopLossCalculator = new StructuralStopLoss(this.config);
    this.takeProfitCalculator = new LiquidityTakeProfit(this.config);
    this.positionSizer = new FixedFractionalSizer(this.config);
    this.tradeManager = new TradeManager(this.config, options.tradeManagerOptions);
  }

  /**
   * Evalúa una señal y decide si aprobar el trade
   * Este es el método principal del Risk Engine
   */
  evaluate(input: RiskInput, volatility?: VolatilityData): EvaluationResult {
    // Usar volatilidad por defecto si no se proporciona
    const vol: VolatilityData = volatility || {
      sigmaTicks: this.config.minStopBufferTicks,
      recentRange: this.config.minStopBufferTicks * this.config.tickSize * 10,
    };

    // 1. Calcular Stop Loss estructural
    const stopLossResult = this.stopLossCalculator.calculate(input, vol);

    // 2. Calcular Take Profit
    const takeProfitResult = this.takeProfitCalculator.calculate(input, stopLossResult.stopLoss);

    // 3. Validar el trade
    const validation = this.validator.validate(
      input,
      stopLossResult.stopLoss,
      takeProfitResult.takeProfit,
      this.currentCapital,
    );

    // Si la validación falla, rechazar el trade
    if (!validation.valid) {
      return this.createRejectedResult(
        input,
        stopLossResult,
        takeProfitResult,
        validation.reason || "Validación fallida",
      );
    }

    // 4. Verificar que el RR cumple el mínimo
    if (!takeProfitResult.meetsMinRR) {
      return this.createRejectedResult(
        input,
        stopLossResult,
        takeProfitResult,
        `RR insuficiente: ${takeProfitResult.rr.toFixed(2)} < ${this.config.minRR}`,
      );
    }

    // 5. Calcular tamaño de posición
    const sizingResult = this.positionSizer.calculate(
      input,
      stopLossResult.stopLoss,
      this.currentCapital,
      this.sizingOptions,
    );

    // Verificar que el tamaño es válido
    if (sizingResult.size <= 0) {
      return this.createRejectedResult(
        input,
        stopLossResult,
        takeProfitResult,
        "Tamaño de posición calculado es 0 o negativo",
      );
    }

    // 6. Trade aprobado - Construir RiskDecision completa según PRD sección 2.2
    const riskTicks = Math.abs(input.entryPrice - stopLossResult.stopLoss) / this.config.tickSize;

    // Construir OrderConfig
    const order: OrderConfig = {
      direction: input.direction,
      entry: {
        type: "LIMIT",
        price: input.entryPrice,
        ttlMs: input.ttlMs ?? 5000,
      },
      size: sizingResult.size,
      stopLoss: stopLossResult.stopLoss,
      takeProfit: takeProfitResult.takeProfit,
      oco: true, // Siempre OCO según PRD
    };

    // Construir ManagementConfig
    const management: ManagementConfig = {
      beAtR: this.config.beAtR,
      beOffsetTicks: this.config.beOffsetTicks,
      partials: this.config.partials,
      trailing: {
        mode: this.config.trailingMode,
        minStepTicks: this.config.trailingMinStepTicks,
      },
      invalidation: {
        maxAdverseDelta: this.config.maxAdverseDelta,
        structuralBreak: this.config.structuralBreakInvalidation,
        timeStopMs: this.config.timeStopMs,
      },
    };

    // Construir RiskMetricsDecision
    const metrics: RiskMetricsDecision = {
      expectedRR: takeProfitResult.rr,
      riskTicks,
    };

    const decision: RiskDecision = {
      approved: true,
      reason: undefined,
      order,
      management,
      metrics,
      // Campos legacy para compatibilidad
      size: sizingResult.size,
      stopLoss: stopLossResult.stopLoss,
      takeProfit: takeProfitResult.takeProfit,
      rr: takeProfitResult.rr,
    };

    return {
      decision,
      stopLossResult,
      takeProfitResult,
      sizingResult,
      details: {
        validationPassed: true,
        rrMeetsMinimum: true,
        confidenceAdjusted: sizingResult.confidenceReduced,
      },
    };
  }

  /**
   * Registra un trade aprobado para gestión post-entry
   * Incluye todos los campos requeridos por TradeState según PRD
   */
  registerTrade(input: RiskInput, decision: RiskDecision): TradeState | null {
    if (!decision.approved) return null;

    const now = Date.now();
    const trade = this.tradeManager.registerTrade({
      direction: input.direction,
      entryPrice: input.entryPrice,
      currentStopLoss: decision.stopLoss,
      originalStopLoss: decision.stopLoss,
      takeProfit: decision.takeProfit,
      originalTakeProfit: decision.takeProfit,
      size: decision.size,
      currentSize: decision.size,
      structureLevel: input.structureLevel,
      createdAt: now,
      openedAt: now,
      partialsExecuted: [],
      management: decision.management,
    });

    // Registrar el trade en el validator
    this.validator.recordTradeExecuted();

    return trade;
  }

  /**
   * Marca un trade como abierto (ejecutado en el exchange)
   */
  openTrade(tradeId: string): TradeState | null {
    return this.tradeManager.openTrade(tradeId);
  }

  /**
   * Actualiza un trade con el contexto de mercado actual
   */
  updateTrade(tradeId: string, context: MarketContext): TradeUpdateEvent[] {
    return this.tradeManager.update(tradeId, context);
  }

  /**
   * Cierra un trade manualmente
   */
  closeTrade(tradeId: string, reason: string): TradeUpdateEvent | null {
    return this.tradeManager.closeTrade(tradeId, "INVALIDATION", reason);
  }

  /**
   * Registra una pérdida (para tracking de pérdida diaria)
   */
  recordLoss(amount: number): void {
    this.validator.recordLoss(amount);
  }

  /**
   * Actualiza el capital actual
   */
  updateCapital(newCapital: number): void {
    this.currentCapital = newCapital;
  }

  /**
   * Obtiene el capital actual
   */
  getCapital(): number {
    return this.currentCapital;
  }

  /**
   * Resetea las métricas de sesión
   */
  resetSession(): void {
    this.validator.resetSession();
  }

  /**
   * Resetea las métricas diarias
   */
  resetDaily(): void {
    this.validator.resetDaily();
  }

  /**
   * Obtiene las métricas del Risk Engine
   */
  getMetrics(): RiskMetrics {
    return this.validator.getMetrics();
  }

  /**
   * Obtiene un trade por ID
   */
  getTrade(tradeId: string): TradeState | undefined {
    return this.tradeManager.getTrade(tradeId);
  }

  /**
   * Obtiene todos los trades activos
   */
  getActiveTrades(): TradeState[] {
    return this.tradeManager.getActiveTrades();
  }

  /**
   * Obtiene todos los trades
   */
  getAllTrades(): TradeState[] {
    return this.tradeManager.getAllTrades();
  }

  /**
   * Obtiene el historial de eventos
   */
  getTradeEvents(): TradeUpdateEvent[] {
    return this.tradeManager.getEvents();
  }

  /**
   * Limpia trades cerrados
   */
  cleanClosedTrades(): void {
    this.tradeManager.cleanClosedTrades();
  }

  /**
   * Actualiza la configuración del Risk Engine
   */
  updateConfig(config: Partial<RiskConfigType>): void {
    this.config = { ...this.config, ...config };
    this.validator.updateConfig(config);
    this.stopLossCalculator.updateConfig(config);
    this.takeProfitCalculator.updateConfig(config);
    this.positionSizer.updateConfig(config);
    this.tradeManager.updateConfig(config);
  }

  /**
   * Obtiene la configuración actual
   */
  getConfig(): RiskConfigType {
    return { ...this.config };
  }

  /**
   * Acceso directo a componentes (para casos avanzados)
   */
  getValidator(): RiskValidator {
    return this.validator;
  }

  getStopLossCalculator(): StructuralStopLoss {
    return this.stopLossCalculator;
  }

  getTakeProfitCalculator(): LiquidityTakeProfit {
    return this.takeProfitCalculator;
  }

  getPositionSizer(): FixedFractionalSizer {
    return this.positionSizer;
  }

  getTradeManager(): TradeManager {
    return this.tradeManager;
  }

  /**
   * Crea un resultado de rechazo con estructura completa según PRD
   */
  private createRejectedResult(
    input: RiskInput,
    stopLossResult: StopLossResult,
    takeProfitResult: TakeProfitResult,
    reason: string,
  ): EvaluationResult {
    const emptySizing: SizingResult = {
      size: 0,
      riskAmount: 0,
      riskPct: 0,
      confidenceReduced: false,
      reductionFactor: 1,
      maxLimited: false,
    };

    const riskTicks = Math.abs(input.entryPrice - stopLossResult.stopLoss) / this.config.tickSize;

    // Construir OrderConfig vacío para rechazo
    const order: OrderConfig = {
      direction: input.direction,
      entry: {
        type: "LIMIT",
        price: input.entryPrice,
        ttlMs: input.ttlMs ?? 5000,
      },
      size: 0,
      stopLoss: stopLossResult.stopLoss,
      takeProfit: takeProfitResult.takeProfit,
      oco: true,
    };

    // Construir ManagementConfig por defecto
    const management: ManagementConfig = {
      beAtR: this.config.beAtR,
      beOffsetTicks: this.config.beOffsetTicks,
      partials: this.config.partials,
      trailing: {
        mode: this.config.trailingMode,
        minStepTicks: this.config.trailingMinStepTicks,
      },
      invalidation: {
        maxAdverseDelta: this.config.maxAdverseDelta,
        structuralBreak: this.config.structuralBreakInvalidation,
        timeStopMs: this.config.timeStopMs,
      },
    };

    // Construir RiskMetricsDecision
    const metrics: RiskMetricsDecision = {
      expectedRR: takeProfitResult.rr,
      riskTicks,
    };

    return {
      decision: {
        approved: false,
        reason,
        order,
        management,
        metrics,
        // Campos legacy para compatibilidad
        size: 0,
        stopLoss: stopLossResult.stopLoss,
        takeProfit: takeProfitResult.takeProfit,
        rr: takeProfitResult.rr,
      },
      stopLossResult,
      takeProfitResult,
      sizingResult: emptySizing,
      details: {
        validationPassed: false,
        validationReason: reason,
        rrMeetsMinimum: takeProfitResult.meetsMinRR,
        confidenceAdjusted: false,
      },
    };
  }
}
