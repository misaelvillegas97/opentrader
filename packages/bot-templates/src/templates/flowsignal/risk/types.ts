/**
 * Risk Engine Types
 *
 * Definiciones de tipos e interfaces para el motor de riesgo.
 * Según PRD sección 2.2
 */

/**
 * Input del Risk Engine - Contrato de entrada
 * Viene del Strategy (FlowSignal)
 */
export interface RiskInput {
  /** Dirección del trade */
  direction: "LONG" | "SHORT";

  /** Precio de entrada propuesto */
  entryPrice: number;

  /** Nivel estructural (swing low/high) para cálculo de SL */
  structureLevel: number;

  /** Objetivo de liquidez para cálculo de TP */
  liquidityTarget: number;

  /** Confianza de la señal (0..1) */
  confidence: number;

  /** Timestamp de la señal */
  timestamp: number;

  /** TTL de la entrada en ms */
  ttlMs?: number;
}

/**
 * Configuración de parciales para salidas escalonadas
 */
export interface PartialExit {
  /** R-múltiple al cual ejecutar el parcial */
  atR: number;
  /** Fracción de la posición a cerrar (0..1) */
  fraction: number;
}

/**
 * Configuración de trailing stop
 */
export interface TrailingConfig {
  /** Modo de trailing */
  mode: "STRUCTURAL" | "FIXED";
  /** Paso mínimo en ticks para mover el trailing */
  minStepTicks: number;
}

/**
 * Configuración de invalidación
 */
export interface InvalidationConfig {
  /** Delta adverso máximo antes de invalidar */
  maxAdverseDelta?: number;
  /** Si se debe cerrar en ruptura estructural */
  structuralBreak: boolean;
  /** Tiempo máximo sin avance antes de cerrar (ms) */
  timeStopMs?: number;
}

/**
 * Configuración de gestión post-entry
 */
export interface ManagementConfig {
  /** R-múltiple al cual activar Break Even */
  beAtR: number;
  /** Offset en ticks para el Break Even */
  beOffsetTicks: number;
  /** Configuración de salidas parciales */
  partials?: PartialExit[];
  /** Configuración de trailing stop */
  trailing: TrailingConfig;
  /** Configuración de invalidación */
  invalidation: InvalidationConfig;
}

/**
 * Métricas de la decisión de riesgo
 */
export interface RiskMetricsDecision {
  /** RR esperado */
  expectedRR: number;
  /** Riesgo en ticks */
  riskTicks: number;
}

/**
 * Configuración de la orden
 */
export interface OrderConfig {
  /** Dirección del trade */
  direction: "LONG" | "SHORT";
  /** Configuración de entrada */
  entry: {
    type: "LIMIT" | "STOP_LIMIT" | "MARKET";
    price: number;
    ttlMs: number;
  };
  /** Tamaño de posición */
  size: number;
  /** Precio de Stop Loss */
  stopLoss: number;
  /** Precio de Take Profit */
  takeProfit: number;
  /** Si debe usar OCO (One-Cancels-Other) - siempre true */
  oco: boolean;
}

/**
 * Output del Risk Engine - Decisión de riesgo
 * Según PRD sección 2.2
 */
export interface RiskDecision {
  /** Si el trade fue aprobado */
  approved: boolean;

  /** Razón del rechazo (si aplica) */
  reason?: string;

  /** Configuración de la orden */
  order: OrderConfig;

  /** Configuración de gestión post-entry */
  management: ManagementConfig;

  /** Métricas de la decisión */
  metrics: RiskMetricsDecision;

  // Campos legacy para compatibilidad
  /** @deprecated Usar order.size */
  size: number;
  /** @deprecated Usar order.stopLoss */
  stopLoss: number;
  /** @deprecated Usar order.takeProfit */
  takeProfit: number;
  /** @deprecated Usar metrics.expectedRR */
  rr: number;
}

/**
 * Resultado de validación
 */
export interface ValidationResult {
  /** Si la validación pasó */
  valid: boolean;

  /** Razón del fallo (si aplica) */
  reason?: string;
}

/**
 * Estados posibles del trade según PRD sección 6
 * IDLE → CANDIDATE → PENDING_ENTRY → OPEN → MANAGED → CLOSED
 */
export type TradeStatus = "IDLE" | "CANDIDATE" | "PENDING_ENTRY" | "OPEN" | "MANAGED" | "CLOSED";

/**
 * Estado del trade para gestión post-entry
 */
export interface TradeState {
  /** ID único del trade */
  id: string;

  /** Estado actual del trade */
  status: TradeStatus;

  /** Dirección del trade */
  direction: "LONG" | "SHORT";

  /** Precio de entrada */
  entryPrice: number;

  /** Stop Loss actual */
  currentStopLoss: number;

  /** Stop Loss original */
  originalStopLoss: number;

  /** Take Profit actual */
  takeProfit: number;

  /** Take Profit original */
  originalTakeProfit: number;

  /** Tamaño de posición original */
  size: number;

  /** Tamaño de posición actual (después de parciales) */
  currentSize: number;

  /** Si Break Even está activado */
  breakEvenActivated: boolean;

  /** Nivel estructural original */
  structureLevel: number;

  /** Timestamp de creación de la señal */
  createdAt: number;

  /** Timestamp de apertura (fill) */
  openedAt: number;

  /** Timestamp de cierre (si aplica) */
  closedAt?: number;

  /** Razón de cierre (si aplica) */
  closeReason?: string;

  /** R-múltiple alcanzado */
  rMultiple?: number;

  /** Configuración de gestión */
  management?: ManagementConfig;

  /** Parciales ejecutados */
  partialsExecuted: number[];

  /** Último precio conocido */
  lastPrice?: number;

  /** Timestamp del último avance favorable */
  lastFavorableAdvanceAt?: number;
}

/**
 * Métricas del Risk Engine
 */
export interface RiskMetrics {
  /** Riesgo real por trade */
  riskPerTrade: number;

  /** R-múltiple alcanzado */
  rMultiple: number;

  /** Drawdown acumulado */
  cumulativeDrawdown: number;

  /** Trades rechazados */
  tradesRejected: number;

  /** Trades aprobados */
  tradesApproved: number;

  /** Pérdida diaria acumulada */
  dailyLoss: number;

  /** Trades ejecutados en la sesión actual */
  sessionTradeCount: number;
}

/**
 * Tipos de eventos de actualización de trade
 */
export type TradeEventType =
  | "BREAK_EVEN"
  | "TRAILING_STOP"
  | "INVALIDATION"
  | "TP_HIT"
  | "SL_HIT"
  | "PARTIAL_EXIT" // PRD sección 5.2B
  | "TIME_STOP"; // PRD sección 5.2E

/**
 * Evento de actualización de trade
 */
export interface TradeUpdateEvent {
  /** Tipo de evento */
  type: TradeEventType;

  /** Trade afectado */
  tradeId: string;

  /** Nuevo valor de SL (si aplica) */
  newStopLoss?: number;

  /** Timestamp del evento */
  timestamp: number;

  /** Razón del evento */
  reason: string;

  /** Fracción cerrada en parcial (0..1) - solo para PARTIAL_EXIT */
  partialFraction?: number;

  /** Tamaño cerrado en parcial - solo para PARTIAL_EXIT */
  partialSize?: number;

  /** R-múltiple al momento del evento */
  rMultipleAtEvent?: number;

  /** Precio al momento del evento */
  priceAtEvent?: number;
}

/**
 * Configuración de volatilidad para cálculos
 */
export interface VolatilityData {
  /** Desviación estándar en ticks */
  sigmaTicks: number;

  /** ATR (Average True Range) */
  atr?: number;

  /** Rango reciente */
  recentRange: number;
}
