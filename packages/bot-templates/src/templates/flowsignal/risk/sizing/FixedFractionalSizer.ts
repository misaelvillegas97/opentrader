/**
 * FixedFractionalSizer - Cálculo de tamaño de posición
 *
 * Implementa el método Fixed Fractional (recomendado):
 *
 * Fórmula:
 * riskAmount = capital * maxRiskPerTradePct
 * size = riskAmount / abs(entry - SL)
 *
 * Opcional:
 * - Reducción por confianza baja
 * - Límite máximo de contratos
 */

import { RiskInput } from "../types.js";
import { RiskConfig, RiskConfigType } from "../config/risk.config.js";

export interface SizingResult {
  /** Tamaño de posición calculado */
  size: number;

  /** Monto de riesgo en moneda base */
  riskAmount: number;

  /** Porcentaje de riesgo aplicado */
  riskPct: number;

  /** Si se aplicó reducción por confianza */
  confidenceReduced: boolean;

  /** Factor de reducción aplicado (1.0 = sin reducción) */
  reductionFactor: number;

  /** Si se aplicó límite máximo */
  maxLimited: boolean;
}

export interface SizingOptions {
  /** Aplicar reducción por confianza baja */
  applyConfidenceReduction?: boolean;

  /** Umbral de confianza para reducción (default: 0.7) */
  confidenceThreshold?: number;

  /** Factor de reducción cuando confianza es baja (default: 0.5) */
  lowConfidenceReduction?: number;

  /** Tamaño máximo de posición permitido */
  maxPositionSize?: number;

  /** Tamaño mínimo de posición permitido */
  minPositionSize?: number;
}

export class FixedFractionalSizer {
  private config: RiskConfigType;
  private defaultOptions: SizingOptions = {
    applyConfidenceReduction: true,
    confidenceThreshold: 0.7,
    lowConfidenceReduction: 0.5,
    maxPositionSize: undefined,
    minPositionSize: 0.001,
  };

  constructor(config: Partial<RiskConfigType> = {}) {
    this.config = { ...RiskConfig, ...config };
  }

  /**
   * Calcula el tamaño de posición óptimo
   */
  calculate(input: RiskInput, stopLoss: number, currentCapital: number, options: SizingOptions = {}): SizingResult {
    const opts = { ...this.defaultOptions, ...options };
    const { maxRiskPerTradePct } = this.config;

    // Calcular riesgo por unidad
    const riskPerUnit = Math.abs(input.entryPrice - stopLoss);

    if (riskPerUnit === 0) {
      return {
        size: 0,
        riskAmount: 0,
        riskPct: 0,
        confidenceReduced: false,
        reductionFactor: 1,
        maxLimited: false,
      };
    }

    // Calcular monto de riesgo base
    let riskPct = maxRiskPerTradePct / 100;
    let riskAmount = currentCapital * riskPct;
    let reductionFactor = 1;
    let confidenceReduced = false;

    // Aplicar reducción por confianza baja
    if (opts.applyConfidenceReduction && input.confidence < (opts.confidenceThreshold ?? 0.7)) {
      reductionFactor = opts.lowConfidenceReduction ?? 0.5;
      riskAmount *= reductionFactor;
      riskPct *= reductionFactor;
      confidenceReduced = true;
    }

    // Calcular tamaño de posición
    let size = riskAmount / riskPerUnit;
    let maxLimited = false;

    // Aplicar límite máximo
    if (opts.maxPositionSize !== undefined && size > opts.maxPositionSize) {
      size = opts.maxPositionSize;
      maxLimited = true;
    }

    // Aplicar límite mínimo
    if (opts.minPositionSize !== undefined && size < opts.minPositionSize) {
      size = 0; // No operar si el tamaño es menor al mínimo
    }

    // Redondear a precisión razonable
    size = this.roundSize(size);

    return {
      size,
      riskAmount,
      riskPct: riskPct * 100,
      confidenceReduced,
      reductionFactor,
      maxLimited,
    };
  }

  /**
   * Calcula el tamaño de posición simple (sin opciones avanzadas)
   */
  calculateSimple(entryPrice: number, stopLoss: number, currentCapital: number): number {
    const { maxRiskPerTradePct } = this.config;

    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    if (riskPerUnit === 0) return 0;

    const riskAmount = currentCapital * (maxRiskPerTradePct / 100);
    const size = riskAmount / riskPerUnit;

    return this.roundSize(size);
  }

  /**
   * Calcula el riesgo real de una posición
   */
  calculateRealRisk(
    size: number,
    entryPrice: number,
    stopLoss: number,
    currentCapital: number,
  ): { riskAmount: number; riskPct: number } {
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const riskAmount = size * riskPerUnit;
    const riskPct = (riskAmount / currentCapital) * 100;

    return { riskAmount, riskPct };
  }

  /**
   * Verifica si un tamaño de posición es válido
   */
  validateSize(
    size: number,
    entryPrice: number,
    stopLoss: number,
    currentCapital: number,
  ): { valid: boolean; reason?: string } {
    if (size <= 0) {
      return { valid: false, reason: "Tamaño de posición debe ser mayor a 0" };
    }

    const { riskPct } = this.calculateRealRisk(size, entryPrice, stopLoss, currentCapital);

    if (riskPct > this.config.maxRiskPerTradePct * 2) {
      return {
        valid: false,
        reason: `Riesgo excesivo: ${riskPct.toFixed(2)}% > máximo permitido`,
      };
    }

    return { valid: true };
  }

  /**
   * Ajusta el tamaño para cumplir con el riesgo máximo
   */
  adjustForMaxRisk(proposedSize: number, entryPrice: number, stopLoss: number, currentCapital: number): number {
    const { riskPct } = this.calculateRealRisk(proposedSize, entryPrice, stopLoss, currentCapital);

    if (riskPct <= this.config.maxRiskPerTradePct) {
      return proposedSize;
    }

    // Recalcular con el riesgo máximo permitido
    return this.calculateSimple(entryPrice, stopLoss, currentCapital);
  }

  /**
   * Obtiene el riesgo máximo por trade configurado
   */
  getMaxRiskPerTrade(): number {
    return this.config.maxRiskPerTradePct;
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<RiskConfigType>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Redondea el tamaño a una precisión razonable
   */
  private roundSize(size: number, decimals: number = 8): number {
    const factor = Math.pow(10, decimals);
    return Math.floor(size * factor) / factor;
  }
}
