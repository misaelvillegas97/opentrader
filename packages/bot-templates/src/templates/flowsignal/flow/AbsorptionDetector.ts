import { DeltaCalculator } from "./DeltaCalculator.js";

/**
 * Resultado de detección de absorción
 */
export interface AbsorptionResult {
  /** Si se detectó absorción */
  detected: boolean;
  /** Lado de la absorción */
  side: "buy" | "sell" | null;
  /** Score de absorción (0..1) según PRD */
  absorptionScore: number;
  /** Score de fallo de continuación (0..1) según PRD */
  continuationFailScore: number;
  /** Percentil del delta */
  deltaPercentile: number;
}

/**
 * AbsorptionDetector - Detecta absorción de órdenes
 *
 * Según PRD sección 7:
 * - Emitir señal solo si absorptionScore >= minAbsorptionScore
 * - Emitir señal solo si continuationFailScore >= minFailScore
 */
export class AbsorptionDetector {
  private minAbsorptionScore: number;
  private minFailScore: number;

  constructor(
    private deltaExtremePercentile: number,
    minAbsorptionScore: number = 0.75,
    minFailScore: number = 0.65,
  ) {
    this.minAbsorptionScore = minAbsorptionScore;
    this.minFailScore = minFailScore;
  }

  /**
   * Detecta absorción y calcula scores
   */
  isAbsorption(
    delta: number,
    deltaCalculator: DeltaCalculator,
    priceChange: number,
    volume: number,
    expectedPriceMove?: number,
  ): AbsorptionResult {
    const percentile = deltaCalculator.getPercentile(delta);

    // Calcular absorptionScore basado en:
    // 1. Qué tan extremo es el delta (percentil)
    // 2. Qué tan poco se movió el precio en relación al delta
    const absorptionScore = this.calculateAbsorptionScore(delta, percentile, priceChange, volume);

    // Calcular continuationFailScore basado en:
    // 1. Si el precio no continuó en la dirección del delta
    // 2. Magnitud del fallo de continuación
    const continuationFailScore = this.calculateContinuationFailScore(delta, priceChange, expectedPriceMove);

    // Determinar si hay absorción
    const meetsAbsorptionThreshold = absorptionScore >= this.minAbsorptionScore;
    const meetsFailThreshold = continuationFailScore >= this.minFailScore;
    const detected = meetsAbsorptionThreshold && meetsFailThreshold;

    // Determinar el lado de la absorción
    let side: "buy" | "sell" | null = null;
    if (detected) {
      // Si delta es positivo (buy aggressive) pero precio no sube -> Sell Absorption (sellers absorbing)
      if (delta > 0 && priceChange <= 0) {
        side = "buy";
      }
      // Si delta es negativo (sell aggressive) pero precio no baja -> Buy Absorption (buyers absorbing)
      else if (delta < 0 && priceChange >= 0) {
        side = "sell";
      }
    }

    return {
      detected,
      side,
      absorptionScore,
      continuationFailScore,
      deltaPercentile: percentile,
    };
  }

  /**
   * Actualiza los umbrales de score
   */
  updateThresholds(minAbsorptionScore: number, minFailScore: number): void {
    this.minAbsorptionScore = minAbsorptionScore;
    this.minFailScore = minFailScore;
  }

  /**
   * Obtiene los umbrales actuales
   */
  getThresholds(): { minAbsorptionScore: number; minFailScore: number } {
    return {
      minAbsorptionScore: this.minAbsorptionScore,
      minFailScore: this.minFailScore,
    };
  }

  /**
   * Calcula el score de absorción (0..1)
   * Basado en qué tan extremo es el delta y qué tan poco se movió el precio
   */
  private calculateAbsorptionScore(delta: number, percentile: number, priceChange: number, volume: number): number {
    // Factor 1: Qué tan extremo es el delta (normalizado 0..1)
    // Si percentile >= deltaExtremePercentile, empieza a contar
    const deltaFactor =
      percentile >= this.deltaExtremePercentile
        ? Math.min(1, (percentile - this.deltaExtremePercentile) / (100 - this.deltaExtremePercentile) + 0.5)
        : (percentile / this.deltaExtremePercentile) * 0.5;

    // Factor 2: Divergencia entre delta y precio
    // Si delta es grande pero precio no se movió mucho, hay absorción
    const absDelta = Math.abs(delta);
    const absPriceChange = Math.abs(priceChange);

    let divergenceFactor = 0;
    if (absDelta > 0) {
      // Si el precio se movió en dirección opuesta al delta, máxima divergencia
      const sameDirection = (delta > 0 && priceChange > 0) || (delta < 0 && priceChange < 0);
      if (!sameDirection) {
        divergenceFactor = 1;
      } else {
        // Si se movió en la misma dirección pero poco, divergencia parcial
        // Esto requeriría conocer el movimiento esperado, simplificamos
        divergenceFactor = 0.3;
      }
    }

    // Combinar factores (peso mayor al deltaFactor)
    const score = deltaFactor * 0.6 + divergenceFactor * 0.4;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calcula el score de fallo de continuación (0..1)
   * Basado en si el precio no continuó en la dirección esperada
   */
  private calculateContinuationFailScore(delta: number, priceChange: number, expectedPriceMove?: number): number {
    // Si no hay delta significativo, no hay fallo de continuación
    if (Math.abs(delta) < 0.001) {
      return 0;
    }

    // Determinar dirección esperada basada en delta
    const expectedDirection = delta > 0 ? 1 : -1;
    const actualDirection = priceChange > 0 ? 1 : priceChange < 0 ? -1 : 0;

    // Si el precio se movió en dirección opuesta, máximo fallo
    if (actualDirection !== 0 && actualDirection !== expectedDirection) {
      return 1;
    }

    // Si el precio no se movió, fallo parcial
    if (actualDirection === 0) {
      return 0.8;
    }

    // Si se movió en la dirección correcta pero menos de lo esperado
    if (expectedPriceMove && expectedPriceMove > 0) {
      const ratio = Math.abs(priceChange) / expectedPriceMove;
      if (ratio < 0.5) {
        return 0.7 * (1 - ratio);
      }
    }

    // Se movió en la dirección correcta, no hay fallo
    return 0;
  }
}
