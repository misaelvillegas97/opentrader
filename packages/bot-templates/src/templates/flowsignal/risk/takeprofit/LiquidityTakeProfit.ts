/**
 * LiquidityTakeProfit - Cálculo de Take Profit lógico
 *
 * Calcula el TP basado en:
 * 1. Objetivo de liquidez (del strategy)
 * 2. RR mínimo requerido
 *
 * Fórmula:
 * TP_rr = entry + minRR * (entry - SL)
 * TP_final = min(TP_liquidity, TP_rr) para LONG
 * TP_final = max(TP_liquidity, TP_rr) para SHORT
 *
 * Si TP_final no cumple RR → trade rechazado
 */

import { RiskInput } from "../types.js";
import { RiskConfig, RiskConfigType } from "../config/risk.config.js";

export interface TakeProfitResult {
  /** Precio del Take Profit calculado */
  takeProfit: number;

  /** TP basado en liquidez */
  tpLiquidity: number;

  /** TP basado en RR mínimo */
  tpMinRR: number;

  /** TP basado en RR objetivo */
  tpTargetRR: number;

  /** RR final calculado */
  rr: number;

  /** Distancia en precio desde entry hasta TP */
  distance: number;

  /** Si el TP cumple con el RR mínimo */
  meetsMinRR: boolean;
}

export class LiquidityTakeProfit {
  private config: RiskConfigType;

  constructor(config: Partial<RiskConfigType> = {}) {
    this.config = { ...RiskConfig, ...config };
  }

  /**
   * Calcula el Take Profit óptimo
   */
  calculate(input: RiskInput, stopLoss: number): TakeProfitResult {
    const { direction, entryPrice, liquidityTarget } = input;
    const { minRR, targetRR, tickSize } = this.config;

    const risk = Math.abs(entryPrice - stopLoss);

    // Calcular TP basado en RR mínimo
    const tpMinRR = this.calculateTPFromRR(direction, entryPrice, risk, minRR);

    // Calcular TP basado en RR objetivo
    const tpTargetRR = this.calculateTPFromRR(direction, entryPrice, risk, targetRR);

    // TP basado en liquidez (del strategy)
    const tpLiquidity = liquidityTarget;

    // Seleccionar el TP final
    // Para LONG: queremos el menor de los dos (más conservador)
    // Para SHORT: queremos el mayor de los dos (más conservador)
    let takeProfit: number;

    if (direction === "LONG") {
      // Para LONG, el TP debe estar ARRIBA del entry
      // Elegimos el más cercano (conservador) entre liquidez y RR mínimo
      if (tpLiquidity > entryPrice && tpMinRR > entryPrice) {
        takeProfit = Math.min(tpLiquidity, tpMinRR);
      } else if (tpLiquidity > entryPrice) {
        takeProfit = tpLiquidity;
      } else {
        takeProfit = tpMinRR;
      }
    } else {
      // Para SHORT, el TP debe estar DEBAJO del entry
      // Elegimos el más cercano (conservador) entre liquidez y RR mínimo
      if (tpLiquidity < entryPrice && tpMinRR < entryPrice) {
        takeProfit = Math.max(tpLiquidity, tpMinRR);
      } else if (tpLiquidity < entryPrice) {
        takeProfit = tpLiquidity;
      } else {
        takeProfit = tpMinRR;
      }
    }

    const reward = Math.abs(takeProfit - entryPrice);
    const rr = risk > 0 ? reward / risk : 0;
    const meetsMinRR = rr >= minRR;

    return {
      takeProfit,
      tpLiquidity,
      tpMinRR,
      tpTargetRR,
      rr,
      distance: reward,
      meetsMinRR,
    };
  }

  /**
   * Calcula el TP usando solo el RR mínimo (sin liquidez)
   */
  calculateFromRR(direction: "LONG" | "SHORT", entryPrice: number, stopLoss: number, rr?: number): number {
    const risk = Math.abs(entryPrice - stopLoss);
    const targetRR = rr ?? this.config.minRR;

    return this.calculateTPFromRR(direction, entryPrice, risk, targetRR);
  }

  /**
   * Valida si un TP propuesto es válido
   */
  validateTakeProfit(direction: "LONG" | "SHORT", entryPrice: number, proposedTakeProfit: number): boolean {
    if (direction === "LONG") {
      return proposedTakeProfit > entryPrice;
    } else {
      return proposedTakeProfit < entryPrice;
    }
  }

  /**
   * Calcula el RR de un trade
   */
  calculateRR(entryPrice: number, stopLoss: number, takeProfit: number): number {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    return risk > 0 ? reward / risk : 0;
  }

  /**
   * Verifica si el TP cumple con el RR mínimo
   */
  meetsMinimumRR(entryPrice: number, stopLoss: number, takeProfit: number): boolean {
    const rr = this.calculateRR(entryPrice, stopLoss, takeProfit);
    return rr >= this.config.minRR;
  }

  /**
   * Obtiene el RR mínimo configurado
   */
  getMinRR(): number {
    return this.config.minRR;
  }

  /**
   * Obtiene el RR objetivo configurado
   */
  getTargetRR(): number {
    return this.config.targetRR;
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<RiskConfigType>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calcula TP basado en un RR específico
   */
  private calculateTPFromRR(direction: "LONG" | "SHORT", entryPrice: number, risk: number, rr: number): number {
    const reward = risk * rr;

    if (direction === "LONG") {
      return entryPrice + reward;
    } else {
      return entryPrice - reward;
    }
  }
}
