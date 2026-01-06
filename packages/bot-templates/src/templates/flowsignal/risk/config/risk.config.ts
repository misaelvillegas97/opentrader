/**
 * Risk Engine Configuration
 *
 * Parámetros de gestión de riesgo para el motor de riesgo.
 * Estos valores son los defaults y pueden ser sobrescritos por configuración del bot.
 * Según PRD secciones 2.2, 4, 5
 */
export const RiskConfig = {
  // ============================================
  // Parámetros de Riesgo Base
  // ============================================

  /** Porcentaje máximo de riesgo por trade (% del capital) */
  maxRiskPerTradePct: 0.5,

  /** Porcentaje máximo de pérdida diaria permitida */
  maxDailyLossPct: 2.0,

  /** Ratio riesgo/beneficio mínimo requerido */
  minRR: 2.0,

  /** Ratio riesgo/beneficio objetivo */
  targetRR: 3.0,

  /** Máximo número de trades por sesión */
  maxTradesPerSession: 5,

  /** Capital inicial para cálculos de sizing */
  initialCapital: 10000,

  // ============================================
  // Parámetros de Instrumento
  // ============================================

  /** Tamaño del tick (precio mínimo de movimiento) - debe configurarse por instrumento */
  tickSize: 0.01,

  /** Spread máximo permitido en ticks para operar */
  maxSpreadTicks: 3,

  // ============================================
  // Parámetros de Stop Loss
  // ============================================

  /** Buffer mínimo en ticks para el Stop Loss */
  minStopBufferTicks: 2,

  /** Multiplicador de volatilidad para cálculo de SL (k en la fórmula) */
  volatilityMultiplier: 1.2,

  // ============================================
  // Parámetros de Break Even
  // ============================================

  /** R-múltiple al cual activar Break Even */
  beAtR: 1.0,

  /** Offset en ticks para el Break Even */
  beOffsetTicks: 1,

  // ============================================
  // Parámetros de Parciales (PRD sección 5.2B)
  // ============================================

  /** Configuración de salidas parciales */
  partials: [
    { atR: 1.5, fraction: 0.4 }, // 40% en 1.5R
    // El 60% restante va al TP final
  ] as Array<{ atR: number; fraction: number }>,

  // ============================================
  // Parámetros de Trailing (PRD sección 5.2C)
  // ============================================

  /** Modo de trailing: STRUCTURAL (solo con nuevos swings) */
  trailingMode: "STRUCTURAL" as const,

  /** Paso mínimo en ticks para mover el trailing */
  trailingMinStepTicks: 2,

  // ============================================
  // Parámetros de Invalidación (PRD sección 5.2D/E)
  // ============================================

  /** Delta adverso máximo antes de invalidar (opcional) */
  maxAdverseDelta: undefined as number | undefined,

  /** Si se debe cerrar en ruptura estructural */
  structuralBreakInvalidation: true,

  /** Tiempo máximo sin avance favorable antes de cerrar (ms) - Time Stop */
  timeStopMs: 300000, // 5 minutos por defecto

  /** Percentil de delta para considerar invalidación */
  invalidationDeltaPercentile: 85,
};

export type RiskConfigType = typeof RiskConfig;
