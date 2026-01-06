/**
 * StructuralStopLoss - Cálculo de Stop Loss estructural
 *
 * Calcula el SL basado en niveles estructurales (swing high/low)
 * con buffer de protección contra ruido de mercado.
 *
 * Fórmula LONG:
 * SL = structureLevel - max(minStopBufferTicks, volatilityMultiplier * sigmaTicks)
 *
 * Para SHORT se invierte la lógica.
 */

import { RiskInput, VolatilityData } from "../types.js";
import { RiskConfig, RiskConfigType } from "../config/risk.config.js";

export interface StopLossResult {
  /** Precio del Stop Loss calculado */
  stopLoss: number;

  /** Distancia en precio desde entry hasta SL */
  distance: number;

  /** Distancia en ticks */
  distanceTicks: number;

  /** Buffer aplicado en ticks */
  bufferApplied: number;
}

export class StructuralStopLoss {
  private config: RiskConfigType;

  constructor(config: Partial<RiskConfigType> = {}) {
    this.config = { ...RiskConfig, ...config };
  }

  /**
   * Calcula el Stop Loss estructural
   */
  calculate(input: RiskInput, volatility: VolatilityData): StopLossResult {
    const { direction, entryPrice, structureLevel } = input;
    const { minStopBufferTicks, volatilityMultiplier, tickSize } = this.config;

    // Calcular buffer basado en volatilidad
    const volatilityBuffer = volatilityMultiplier * volatility.sigmaTicks;
    const bufferTicks = Math.max(minStopBufferTicks, volatilityBuffer);
    const bufferPrice = bufferTicks * tickSize;

    let stopLoss: number;

    if (direction === "LONG") {
      // Para LONG: SL debajo del swing low
      stopLoss = structureLevel - bufferPrice;

      // Validar que el SL esté debajo del entry
      if (stopLoss >= entryPrice) {
        // Ajustar SL a un mínimo razonable debajo del entry
        stopLoss = entryPrice - minStopBufferTicks * tickSize * 2;
      }
    } else {
      // Para SHORT: SL encima del swing high
      stopLoss = structureLevel + bufferPrice;

      // Validar que el SL esté encima del entry
      if (stopLoss <= entryPrice) {
        // Ajustar SL a un mínimo razonable encima del entry
        stopLoss = entryPrice + minStopBufferTicks * tickSize * 2;
      }
    }

    const distance = Math.abs(entryPrice - stopLoss);
    const distanceTicks = distance / tickSize;

    return {
      stopLoss,
      distance,
      distanceTicks,
      bufferApplied: bufferTicks,
    };
  }

  /**
   * Calcula el SL con un buffer fijo (sin volatilidad)
   */
  calculateFixed(input: RiskInput, bufferTicks?: number): StopLossResult {
    const { direction, entryPrice, structureLevel } = input;
    const { minStopBufferTicks, tickSize } = this.config;

    const actualBuffer = bufferTicks ?? minStopBufferTicks;
    const bufferPrice = actualBuffer * tickSize;

    let stopLoss: number;

    if (direction === "LONG") {
      stopLoss = structureLevel - bufferPrice;
      if (stopLoss >= entryPrice) {
        stopLoss = entryPrice - minStopBufferTicks * tickSize * 2;
      }
    } else {
      stopLoss = structureLevel + bufferPrice;
      if (stopLoss <= entryPrice) {
        stopLoss = entryPrice + minStopBufferTicks * tickSize * 2;
      }
    }

    const distance = Math.abs(entryPrice - stopLoss);
    const distanceTicks = distance / tickSize;

    return {
      stopLoss,
      distance,
      distanceTicks,
      bufferApplied: actualBuffer,
    };
  }

  /**
   * Valida si un SL propuesto es válido
   */
  validateStopLoss(direction: "LONG" | "SHORT", entryPrice: number, proposedStopLoss: number): boolean {
    if (direction === "LONG") {
      return proposedStopLoss < entryPrice;
    } else {
      return proposedStopLoss > entryPrice;
    }
  }

  /**
   * Calcula la distancia mínima requerida para el SL
   */
  getMinimumStopDistance(): number {
    return this.config.minStopBufferTicks * this.config.tickSize;
  }

  /**
   * Ajusta el SL para cumplir con el RR mínimo
   */
  adjustForMinRR(direction: "LONG" | "SHORT", entryPrice: number, takeProfit: number, minRR: number): number {
    const reward = Math.abs(takeProfit - entryPrice);
    const maxRisk = reward / minRR;

    if (direction === "LONG") {
      return entryPrice - maxRisk;
    } else {
      return entryPrice + maxRisk;
    }
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<RiskConfigType>): void {
    this.config = { ...this.config, ...config };
  }
}
