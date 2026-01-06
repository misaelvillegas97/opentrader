import { AbsorptionDetector, AbsorptionResult } from "../flow/AbsorptionDetector.js";
import { DeltaCalculator } from "../flow/DeltaCalculator.js";
import { Swing, SwingDetector } from "../structure/SwingDetector.js";
import { StructureValidator } from "../structure/StructureValidator.js";
import { FlowSignal, LiquidityZoneType, TradingSession } from "./SignalTypes.js";
import { FlowSignalConfig } from "../config/flowsignal.config.js";

/**
 * Contexto de mercado para detección de señales
 */
export interface DetectionContext {
  currentPrice: number;
  delta: number;
  deltaCalculator: DeltaCalculator;
  swingDetector: SwingDetector;
  volume: number;
  priceChange: number;
  /** Sesión actual */
  session?: TradingSession;
  /** Tipo de zona de liquidez cercana */
  liquidityZoneType?: LiquidityZoneType;
  /** Volatilidad en ticks */
  volatilityTicks?: number;
  /** CVD slope */
  cvdSlope?: number;
  /** Objetivo de liquidez calculado externamente */
  liquidityTarget?: number;
}

/**
 * FlowSignalDetector - Detecta señales de trading
 *
 * Según PRD sección 7:
 * - Implementa cooldown entre señales
 * - Incluye ttlMs en la señal
 * - Genera señales con context y features completas
 */
export class FlowSignalDetector {
  private lastSignalTime: Map<string, number> = new Map();
  private signalCounter: number = 0;
  private cooldownMs: number;
  private ttlMs: number;

  constructor(
    private absorptionDetector: AbsorptionDetector,
    private structureValidator: StructureValidator,
    cooldownMs: number = FlowSignalConfig.cooldownMs,
    ttlMs: number = FlowSignalConfig.ttlMs,
  ) {
    this.cooldownMs = cooldownMs;
    this.ttlMs = ttlMs;
  }

  /**
   * Detecta señales de trading
   * Retorna null si no hay señal válida o si está en cooldown
   */
  detect(
    currentPrice: number,
    delta: number,
    deltaCalculator: DeltaCalculator,
    swingDetector: SwingDetector,
    volume: number,
    priceChange: number,
    context?: Partial<DetectionContext>,
  ): FlowSignal | null {
    // Verificar cooldown
    const instrumentKey = "default"; // TODO: usar símbolo real cuando esté disponible
    if (this.isInCooldown(instrumentKey)) {
      return null;
    }

    // Detectar absorción con scores
    const absorption = this.absorptionDetector.isAbsorption(delta, deltaCalculator, priceChange, volume);

    if (!absorption.detected) return null;

    const direction = absorption.side === "sell" ? "LONG" : "SHORT";

    // Validar estructura
    if (!this.structureValidator.isValid(absorption.side!, currentPrice, swingDetector)) {
      return null;
    }

    // Obtener nivel estructural
    const swings = swingDetector.getLastSwings();
    const structureLevel =
      direction === "LONG"
        ? swings.filter((s: Swing) => s.type.includes("L")).pop()?.price || currentPrice * 0.99
        : swings.filter((s: Swing) => s.type.includes("H")).pop()?.price || currentPrice * 1.01;

    // Calcular objetivo de liquidez
    const liquidityTarget =
      context?.liquidityTarget ?? (direction === "LONG" ? currentPrice * 1.02 : currentPrice * 0.98);

    // Calcular confianza basada en scores
    const confidence = this.calculateConfidence(absorption);

    // Generar señal completa según PRD
    const signal: FlowSignal = {
      id: this.generateSignalId(),
      direction,
      entryPlan: {
        type: "LIMIT",
        price: currentPrice,
        ttlMs: this.ttlMs,
        maxSlippageTicks: 2,
      },
      structureLevel,
      liquidityTarget,
      context: {
        session: context?.session ?? "NY",
        liquidityZoneType: context?.liquidityZoneType ?? "OTHER",
        volatilityTicks: context?.volatilityTicks ?? 10,
      },
      features: {
        delta,
        cvdSlope: context?.cvdSlope ?? 0,
        absorptionScore: absorption.absorptionScore,
        continuationFailScore: absorption.continuationFailScore,
      },
      confidence,
      timestamp: Date.now(),
    };

    // Registrar tiempo de señal para cooldown
    this.lastSignalTime.set(instrumentKey, Date.now());

    return signal;
  }

  /**
   * Verifica si una señal ha expirado (TTL)
   */
  isSignalExpired(signal: FlowSignal): boolean {
    const elapsed = Date.now() - signal.timestamp;
    return elapsed > signal.entryPlan.ttlMs;
  }

  /**
   * Resetea el cooldown para un instrumento
   */
  resetCooldown(instrumentKey: string = "default"): void {
    this.lastSignalTime.delete(instrumentKey);
  }

  /**
   * Actualiza la configuración de cooldown y TTL
   */
  updateConfig(cooldownMs: number, ttlMs: number): void {
    this.cooldownMs = cooldownMs;
    this.ttlMs = ttlMs;
  }

  /**
   * Obtiene el tiempo restante de cooldown
   */
  getCooldownRemaining(instrumentKey: string = "default"): number {
    const lastTime = this.lastSignalTime.get(instrumentKey);
    if (!lastTime) return 0;

    const elapsed = Date.now() - lastTime;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  /**
   * Verifica si está en período de cooldown
   */
  private isInCooldown(instrumentKey: string): boolean {
    const lastTime = this.lastSignalTime.get(instrumentKey);
    if (!lastTime) return false;

    const elapsed = Date.now() - lastTime;
    return elapsed < this.cooldownMs;
  }

  /**
   * Genera un ID único para la señal
   */
  private generateSignalId(): string {
    this.signalCounter++;
    return `fs_${Date.now()}_${this.signalCounter}`;
  }

  /**
   * Calcula la confianza de la señal basada en los scores
   */
  private calculateConfidence(absorption: AbsorptionResult): number {
    // Combinar absorptionScore y continuationFailScore
    const baseConfidence = absorption.absorptionScore * 0.6 + absorption.continuationFailScore * 0.4;

    // Ajustar por percentil de delta
    const deltaBonus = absorption.deltaPercentile >= 90 ? 0.1 : 0;

    return Math.min(1, baseConfidence + deltaBonus);
  }
}
