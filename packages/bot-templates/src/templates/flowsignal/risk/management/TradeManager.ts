/**
 * TradeManager - Gestión post-entry de trades
 *
 * Responsabilidades según PRD sección 5:
 * 1. Break Even - Activar al alcanzar +beAtR (5.2A)
 * 2. Parciales - Salidas escalonadas en R-múltiples (5.2B)
 * 3. Trailing estructural - Mover SL solo con nuevo higher-low/lower-high (5.2C)
 * 4. Invalidación - Cerrar si se rompe estructura o absorción contraria (5.2D)
 * 5. Time Stop - Cerrar si no hay avance en timeStopMs (5.2E)
 *
 * Estados del trade: IDLE → CANDIDATE → PENDING_ENTRY → OPEN → MANAGED → CLOSED
 */

import { TradeState, TradeUpdateEvent } from "../types.js";
import { RiskConfig, RiskConfigType } from "../config/risk.config.js";

export interface TradeManagerOptions {
  /** Habilitar Break Even automático */
  enableBreakEven?: boolean;

  /** Habilitar Trailing estructural */
  enableTrailing?: boolean;

  /** Habilitar invalidación automática */
  enableInvalidation?: boolean;

  /** Habilitar salidas parciales (PRD 5.2B) */
  enablePartials?: boolean;

  /** Habilitar time stop (PRD 5.2E) */
  enableTimeStop?: boolean;
}

export interface SwingPoint {
  price: number;
  type: "HIGH" | "LOW";
  timestamp: number;
}

export interface MarketContext {
  currentPrice: number;
  delta?: number;
  deltaPercentile?: number;
  newSwing?: SwingPoint;
  structureBroken?: boolean;
  absorptionDetected?: boolean;
  absorptionSide?: "buy" | "sell";
  /** Timestamp actual para cálculos de time stop */
  currentTimestamp?: number;
}

export class TradeManager {
  private config: RiskConfigType;
  private trades: Map<string, TradeState> = new Map();
  private events: TradeUpdateEvent[] = [];
  private options: TradeManagerOptions;

  constructor(config: Partial<RiskConfigType> = {}, options: TradeManagerOptions = {}) {
    this.config = { ...RiskConfig, ...config };
    this.options = {
      enableBreakEven: true,
      enableTrailing: true,
      enableInvalidation: true,
      enablePartials: true, // PRD 5.2B
      enableTimeStop: true, // PRD 5.2E
      ...options,
    };
  }

  /**
   * Registra un nuevo trade
   * Estado inicial: PENDING_ENTRY según PRD sección 6
   */
  registerTrade(trade: Omit<TradeState, "id" | "status" | "breakEvenActivated">): TradeState {
    const id = this.generateTradeId();
    const newTrade: TradeState = {
      ...trade,
      id,
      status: "PENDING_ENTRY",
      breakEvenActivated: false,
    };

    this.trades.set(id, newTrade);
    return newTrade;
  }

  /**
   * Marca un trade como abierto (ejecutado)
   */
  openTrade(tradeId: string): TradeState | null {
    const trade = this.trades.get(tradeId);
    if (!trade) return null;

    trade.status = "OPEN";
    return trade;
  }

  /**
   * Actualiza un trade basado en el contexto de mercado actual
   * Retorna eventos de actualización si hay cambios
   */
  update(tradeId: string, context: MarketContext): TradeUpdateEvent[] {
    const trade = this.trades.get(tradeId);
    if (!trade || trade.status === "CLOSED") return [];

    const events: TradeUpdateEvent[] = [];

    // Actualizar último precio y timestamp de avance favorable
    this.updateFavorableAdvance(trade, context.currentPrice, context.currentTimestamp);

    // 1. Verificar si se alcanzó TP
    if (this.checkTakeProfitHit(trade, context.currentPrice)) {
      const event = this.closeTrade(tradeId, "TP_HIT", "Take Profit alcanzado");
      if (event) events.push(event);
      return events;
    }

    // 2. Verificar si se alcanzó SL
    if (this.checkStopLossHit(trade, context.currentPrice)) {
      const event = this.closeTrade(tradeId, "SL_HIT", "Stop Loss alcanzado");
      if (event) events.push(event);
      return events;
    }

    // 3. Verificar Time Stop (PRD 5.2E)
    if (this.options.enableTimeStop) {
      const timeStopEvent = this.checkTimeStop(trade, context.currentPrice, context.currentTimestamp);
      if (timeStopEvent) {
        events.push(timeStopEvent);
        return events;
      }
    }

    // 4. Verificar invalidación
    if (this.options.enableInvalidation) {
      const invalidationEvent = this.checkInvalidation(trade, context);
      if (invalidationEvent) {
        events.push(invalidationEvent);
        return events;
      }
    }

    // 5. Verificar Parciales (PRD 5.2B)
    if (this.options.enablePartials) {
      const partialEvents = this.checkPartials(trade, context.currentPrice);
      if (partialEvents.length > 0) {
        events.push(...partialEvents);
        trade.status = "MANAGED";
      }
    }

    // 6. Verificar Break Even
    if (this.options.enableBreakEven && !trade.breakEvenActivated) {
      const beEvent = this.checkBreakEven(trade, context.currentPrice);
      if (beEvent) {
        events.push(beEvent);
        trade.status = "MANAGED";
      }
    }

    // 7. Verificar Trailing estructural
    if (this.options.enableTrailing && context.newSwing) {
      const trailEvent = this.checkTrailingStop(trade, context.newSwing);
      if (trailEvent) {
        events.push(trailEvent);
        trade.status = "MANAGED";
      }
    }

    this.events.push(...events);
    return events;
  }

  /**
   * Cierra un trade
   */
  closeTrade(tradeId: string, type: "TP_HIT" | "SL_HIT" | "INVALIDATION", reason: string): TradeUpdateEvent | null {
    const trade = this.trades.get(tradeId);
    if (!trade) return null;

    trade.status = "CLOSED";
    trade.closedAt = Date.now();
    trade.closeReason = reason;

    // Calcular R-múltiple
    const risk = Math.abs(trade.entryPrice - trade.originalStopLoss);
    // Nota: El R-múltiple real se calcularía con el precio de cierre real
    // Aquí solo marcamos el evento

    return {
      type,
      tradeId,
      timestamp: Date.now(),
      reason,
    };
  }

  /**
   * Obtiene un trade por ID
   */
  getTrade(tradeId: string): TradeState | undefined {
    return this.trades.get(tradeId);
  }

  /**
   * Obtiene todos los trades activos
   */
  getActiveTrades(): TradeState[] {
    return Array.from(this.trades.values()).filter((t) => t.status !== "CLOSED");
  }

  /**
   * Obtiene todos los trades
   */
  getAllTrades(): TradeState[] {
    return Array.from(this.trades.values());
  }

  /**
   * Obtiene el historial de eventos
   */
  getEvents(): TradeUpdateEvent[] {
    return [...this.events];
  }

  /**
   * Limpia trades cerrados
   */
  cleanClosedTrades(): void {
    for (const [id, trade] of this.trades) {
      if (trade.status === "CLOSED") {
        this.trades.delete(id);
      }
    }
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<RiskConfigType>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Actualizar opciones
   */
  updateOptions(options: Partial<TradeManagerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Actualiza el tracking de avance favorable para time stop
   */
  private updateFavorableAdvance(trade: TradeState, currentPrice: number, currentTimestamp?: number): void {
    const timestamp = currentTimestamp ?? Date.now();
    trade.lastPrice = currentPrice;

    // Verificar si hay avance favorable
    const isFavorable = trade.direction === "LONG" ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;

    if (isFavorable) {
      trade.lastFavorableAdvanceAt = timestamp;
    }

    // Inicializar si no existe
    if (!trade.lastFavorableAdvanceAt) {
      trade.lastFavorableAdvanceAt = trade.openedAt;
    }
  }

  /**
   * PRD 5.2B: Verificar salidas parciales
   * Ejemplo: 40% en 1.5R, 60% al TP final
   */
  private checkPartials(trade: TradeState, currentPrice: number): TradeUpdateEvent[] {
    const events: TradeUpdateEvent[] = [];
    const partials = trade.management?.partials ?? this.config.partials;

    if (!partials || partials.length === 0) return events;

    // Calcular R-múltiple actual
    const risk = Math.abs(trade.entryPrice - trade.originalStopLoss);
    if (risk === 0) return events;

    const currentMove = trade.direction === "LONG" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
    const currentR = currentMove / risk;

    // Verificar cada nivel de parcial
    for (let i = 0; i < partials.length; i++) {
      const partial = partials[i];

      // Saltar si ya se ejecutó este parcial
      if (trade.partialsExecuted.includes(i)) continue;

      // Verificar si se alcanzó el nivel
      if (currentR >= partial.atR) {
        const partialSize = trade.currentSize * partial.fraction;

        // Actualizar tamaño restante
        trade.currentSize -= partialSize;
        trade.partialsExecuted.push(i);

        events.push({
          type: "PARTIAL_EXIT",
          tradeId: trade.id,
          timestamp: Date.now(),
          reason: `Parcial ${partial.fraction * 100}% ejecutado en ${partial.atR}R`,
          partialFraction: partial.fraction,
          partialSize,
          rMultipleAtEvent: currentR,
          priceAtEvent: currentPrice,
        });
      }
    }

    return events;
  }

  /**
   * PRD 5.2E: Time Stop - Cerrar si no hay avance favorable en timeStopMs
   */
  private checkTimeStop(trade: TradeState, currentPrice: number, currentTimestamp?: number): TradeUpdateEvent | null {
    const timeStopMs = trade.management?.invalidation?.timeStopMs ?? this.config.timeStopMs;

    // Si no hay time stop configurado, no hacer nada
    if (!timeStopMs || timeStopMs <= 0) return null;

    const timestamp = currentTimestamp ?? Date.now();
    const lastAdvance = trade.lastFavorableAdvanceAt ?? trade.openedAt;
    const timeSinceAdvance = timestamp - lastAdvance;

    // Verificar si excedió el tiempo sin avance
    if (timeSinceAdvance >= timeStopMs) {
      // Calcular R-múltiple actual
      const risk = Math.abs(trade.entryPrice - trade.originalStopLoss);
      const currentMove =
        trade.direction === "LONG" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
      const currentR = risk > 0 ? currentMove / risk : 0;

      // Cerrar el trade
      trade.status = "CLOSED";
      trade.closedAt = timestamp;
      trade.closeReason = "Time Stop";
      trade.rMultiple = currentR;

      return {
        type: "TIME_STOP",
        tradeId: trade.id,
        timestamp,
        reason: `Time Stop: ${Math.round(timeSinceAdvance / 1000)}s sin avance favorable (límite: ${Math.round(timeStopMs / 1000)}s)`,
        rMultipleAtEvent: currentR,
        priceAtEvent: currentPrice,
      };
    }

    return null;
  }

  /**
   * 12.1 Break Even - Activar al alcanzar +beAtR
   */
  private checkBreakEven(trade: TradeState, currentPrice: number): TradeUpdateEvent | null {
    const { beAtR, beOffsetTicks, tickSize } = this.config;

    const risk = Math.abs(trade.entryPrice - trade.originalStopLoss);
    const targetMove = risk * beAtR;

    let shouldActivate = false;

    if (trade.direction === "LONG") {
      // Para LONG: precio debe subir al menos beAtR * riesgo
      shouldActivate = currentPrice >= trade.entryPrice + targetMove;
    } else {
      // Para SHORT: precio debe bajar al menos beAtR * riesgo
      shouldActivate = currentPrice <= trade.entryPrice - targetMove;
    }

    if (shouldActivate) {
      // Nuevo SL: entry + beOffsetTicks (para LONG) o entry - beOffsetTicks (para SHORT)
      const beOffset = beOffsetTicks * tickSize;
      const newStopLoss = trade.direction === "LONG" ? trade.entryPrice + beOffset : trade.entryPrice - beOffset;

      trade.currentStopLoss = newStopLoss;
      trade.breakEvenActivated = true;

      return {
        type: "BREAK_EVEN",
        tradeId: trade.id,
        newStopLoss,
        timestamp: Date.now(),
        reason: `Break Even activado al alcanzar ${beAtR}R`,
      };
    }

    return null;
  }

  /**
   * 12.2 Trailing estructural - Mover SL solo con nuevo swing
   * Nunca trailing por ticks fijos
   */
  private checkTrailingStop(trade: TradeState, newSwing: SwingPoint): TradeUpdateEvent | null {
    // Solo mover si el nuevo swing mejora nuestra posición

    if (trade.direction === "LONG") {
      // Para LONG: buscamos higher-lows para subir el SL
      if (newSwing.type === "LOW" && newSwing.price > trade.currentStopLoss) {
        // Verificar que el nuevo SL sigue siendo válido (debajo del entry si no hay BE)
        if (!trade.breakEvenActivated && newSwing.price >= trade.entryPrice) {
          return null; // No mover SL por encima del entry sin BE
        }

        const oldSL = trade.currentStopLoss;
        trade.currentStopLoss = newSwing.price - this.config.minStopBufferTicks * this.config.tickSize;

        return {
          type: "TRAILING_STOP",
          tradeId: trade.id,
          newStopLoss: trade.currentStopLoss,
          timestamp: Date.now(),
          reason: `Trailing a nuevo higher-low: ${oldSL.toFixed(4)} → ${trade.currentStopLoss.toFixed(4)}`,
        };
      }
    } else {
      // Para SHORT: buscamos lower-highs para bajar el SL
      if (newSwing.type === "HIGH" && newSwing.price < trade.currentStopLoss) {
        // Verificar que el nuevo SL sigue siendo válido (encima del entry si no hay BE)
        if (!trade.breakEvenActivated && newSwing.price <= trade.entryPrice) {
          return null; // No mover SL por debajo del entry sin BE
        }

        const oldSL = trade.currentStopLoss;
        trade.currentStopLoss = newSwing.price + this.config.minStopBufferTicks * this.config.tickSize;

        return {
          type: "TRAILING_STOP",
          tradeId: trade.id,
          newStopLoss: trade.currentStopLoss,
          timestamp: Date.now(),
          reason: `Trailing a nuevo lower-high: ${oldSL.toFixed(4)} → ${trade.currentStopLoss.toFixed(4)}`,
        };
      }
    }

    return null;
  }

  /**
   * 12.3 Invalidación - Cerrar trade si se cumplen condiciones
   */
  private checkInvalidation(trade: TradeState, context: MarketContext): TradeUpdateEvent | null {
    // Condición 1: Se rompe estructura original
    if (context.structureBroken) {
      return this.closeTrade(trade.id, "INVALIDATION", "Estructura original rota");
    }

    // Condición 2: Absorción contraria fuerte
    if (context.absorptionDetected) {
      const isContraryAbsorption =
        (trade.direction === "LONG" && context.absorptionSide === "buy") ||
        (trade.direction === "SHORT" && context.absorptionSide === "sell");

      if (isContraryAbsorption && (context.deltaPercentile ?? 0) >= 90) {
        return this.closeTrade(trade.id, "INVALIDATION", "Absorción contraria fuerte detectada");
      }
    }

    // Condición 3: Delta extremo sin avance favorable
    if (context.delta !== undefined && context.deltaPercentile !== undefined) {
      if (context.deltaPercentile >= 85) {
        const priceMove = context.currentPrice - trade.entryPrice;
        const favorableMove = trade.direction === "LONG" ? priceMove > 0 : priceMove < 0;

        if (!favorableMove) {
          // Delta extremo pero precio no avanza en nuestra dirección
          // Solo invalidar si llevamos tiempo en el trade
          const tradeAge = Date.now() - trade.openedAt;
          if (tradeAge > 60000) {
            // Más de 1 minuto
            return this.closeTrade(trade.id, "INVALIDATION", "Delta extremo sin avance favorable");
          }
        }
      }
    }

    return null;
  }

  /**
   * Verifica si se alcanzó el Take Profit
   */
  private checkTakeProfitHit(trade: TradeState, currentPrice: number): boolean {
    if (trade.direction === "LONG") {
      return currentPrice >= trade.takeProfit;
    } else {
      return currentPrice <= trade.takeProfit;
    }
  }

  /**
   * Verifica si se alcanzó el Stop Loss
   */
  private checkStopLossHit(trade: TradeState, currentPrice: number): boolean {
    if (trade.direction === "LONG") {
      return currentPrice <= trade.currentStopLoss;
    } else {
      return currentPrice >= trade.currentStopLoss;
    }
  }

  /**
   * Genera un ID único para el trade
   */
  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
