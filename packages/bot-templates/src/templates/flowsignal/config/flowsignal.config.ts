/**
 * FlowSignal Strategy Configuration
 *
 * Parámetros de configuración para la estrategia FlowSignal.
 * Según PRD sección 7 (Reglas para emitir FlowSignal)
 */
export const FlowSignalConfig = {
  // ============================================
  // Parámetros de Sesión y Contexto
  // ============================================

  /** Sesiones habilitadas para operar */
  sessions: ["NY"] as Array<"NY" | "LDN" | "ASIA">,

  /** Rango mínimo en ticks para considerar volatilidad suficiente */
  minRangeTicks: 20,

  // ============================================
  // Parámetros de Detección de Absorción (PRD sección 7)
  // ============================================

  /** Percentil de delta para considerar extremo */
  deltaExtremePercentile: 85,

  /** Score mínimo de absorción para emitir señal (0..1) */
  minAbsorptionScore: 0.75,

  /** Score mínimo de fallo de continuación (0..1) */
  minFailScore: 0.65,

  /** Ventana de tiempo para detectar absorción (segundos) */
  absorptionWindowSec: 3,

  /** Ticks máximos de continuación antes de considerar fallo */
  maxContinuationTicks: 4,

  // ============================================
  // Parámetros de Control de Señales (PRD sección 7)
  // ============================================

  /** Cooldown entre señales por instrumento (ms) */
  cooldownMs: 60000, // 60 segundos

  /** Tiempo de vida de la señal (ms) - después de esto se invalida */
  ttlMs: 5000, // 5 segundos

  /** Timeout de entrada (segundos) - legacy, usar ttlMs */
  entryTimeoutSec: 5,

  // ============================================
  // Parámetros de RR (legacy - usar RiskConfig)
  // ============================================

  /** @deprecated Usar RiskConfig.minRR */
  rrMin: 2.0,

  /** @deprecated Usar RiskConfig.targetRR */
  rrTarget: 3.0,
};
