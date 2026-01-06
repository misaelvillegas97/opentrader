/**
 * FlowSignal - Señal de trading emitida por FlowSignalStrategy
 *
 * Contrato según PRD sección 2.1:
 * - La señal es "pura": solo edge/entrada/contexto
 * - NO incluye SL/TP/size (eso lo calcula Risk Engine)
 */
export interface FlowSignal {
  /** ID único de la señal */
  id: string;

  /** Dirección del trade */
  direction: "LONG" | "SHORT";

  /** Plan de entrada */
  entryPlan: {
    type: "LIMIT" | "STOP_LIMIT" | "MARKET";
    price: number;
    /** Tiempo de vida de la señal en ms */
    ttlMs: number;
    /** Slippage máximo permitido en ticks */
    maxSlippageTicks?: number;
  };

  /** Nivel estructural (swingLow para LONG, swingHigh para SHORT) = invalidación base */
  structureLevel: number;

  /** Objetivo de liquidez sugerido */
  liquidityTarget: number;

  /** Contexto de mercado */
  context: {
    session: "NY" | "LDN" | "ASIA";
    liquidityZoneType: "PDH" | "PDL" | "SDH" | "SDL" | "VWAP" | "HVN" | "LVN" | "OTHER";
    volatilityTicks: number;
  };

  /** Features de la señal para análisis */
  features: {
    delta: number;
    cvdSlope: number;
    /** Score de absorción (0..1) */
    absorptionScore: number;
    /** Score de fallo de continuación (0..1) */
    continuationFailScore: number;
  };

  /** Confianza de la señal (0..1) */
  confidence: number;

  /** Timestamp de emisión */
  timestamp: number;
}

/**
 * Tipo de sesión de trading
 */
export type TradingSession = "NY" | "LDN" | "ASIA";

/**
 * Tipo de zona de liquidez
 */
export type LiquidityZoneType = "PDH" | "PDL" | "SDH" | "SDL" | "VWAP" | "HVN" | "LVN" | "OTHER";
