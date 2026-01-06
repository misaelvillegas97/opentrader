/**
 * RiskValidator - Validación previa de trades
 *
 * Implementa las reglas duras que deben cumplirse antes de aprobar un trade.
 * Según PRD sección 4.2 (Validaciones obligatorias)
 * ❌ Si falla cualquier validación → trade rechazado
 */

import { RiskInput, RiskMetrics, ValidationResult } from "../types.js";
import { RiskConfig, RiskConfigType } from "../config/risk.config.js";

/**
 * Contexto de mercado para validaciones
 */
export interface MarketValidationContext {
  /** Spread actual en ticks */
  spreadTicks?: number;
  /** Sesión actual */
  session?: "NY" | "LDN" | "ASIA";
  /** Volatilidad actual en ticks */
  volatilityTicks?: number;
}

export class RiskValidator {
  private config: RiskConfigType;
  private metrics: RiskMetrics;

  constructor(config: Partial<RiskConfigType> = {}) {
    this.config = { ...RiskConfig, ...config };
    this.metrics = this.initializeMetrics();
  }

  /**
   * Valida un trade contra todas las reglas duras
   * Según PRD sección 4.2
   */
  validate(
    input: RiskInput,
    proposedStopLoss: number,
    proposedTakeProfit: number,
    currentCapital: number,
    marketContext?: MarketValidationContext,
  ): ValidationResult {
    // Regla 1: Capital disponible suficiente
    const capitalCheck = this.validateCapital(currentCapital);
    if (!capitalCheck.valid) {
      this.metrics.tradesRejected++;
      return capitalCheck;
    }

    // Regla 2: Riesgo ≤ maxRiskPerTradePct
    const riskCheck = this.validateRiskPerTrade(input, proposedStopLoss, currentCapital);
    if (!riskCheck.valid) {
      this.metrics.tradesRejected++;
      return riskCheck;
    }

    // Regla 3: RR esperado ≥ minRR
    const rrCheck = this.validateRiskReward(input, proposedStopLoss, proposedTakeProfit);
    if (!rrCheck.valid) {
      this.metrics.tradesRejected++;
      return rrCheck;
    }

    // Regla 4: No exceder pérdida diaria
    const dailyLossCheck = this.validateDailyLoss(currentCapital);
    if (!dailyLossCheck.valid) {
      this.metrics.tradesRejected++;
      return dailyLossCheck;
    }

    // Regla 5: No exceder trades por sesión
    const sessionCheck = this.validateSessionTrades();
    if (!sessionCheck.valid) {
      this.metrics.tradesRejected++;
      return sessionCheck;
    }

    // Regla 6: Spread no excede máximo (PRD sección 4.2)
    if (marketContext?.spreadTicks !== undefined) {
      const spreadCheck = this.validateSpread(marketContext.spreadTicks);
      if (!spreadCheck.valid) {
        this.metrics.tradesRejected++;
        return spreadCheck;
      }
    }

    // Regla 7: Volatilidad mínima (opcional)
    if (marketContext?.volatilityTicks !== undefined) {
      const volatilityCheck = this.validateVolatility(marketContext.volatilityTicks);
      if (!volatilityCheck.valid) {
        this.metrics.tradesRejected++;
        return volatilityCheck;
      }
    }

    this.metrics.tradesApproved++;
    return { valid: true };
  }

  /**
   * Regla 6: Verificar que el spread no exceda el máximo permitido
   * PRD sección 4.2: "Rechazar si Spread > maxSpreadTicks"
   */
  validateSpread(spreadTicks: number): ValidationResult {
    if (spreadTicks > this.config.maxSpreadTicks) {
      return {
        valid: false,
        reason: `Spread excesivo: ${spreadTicks} ticks > máximo ${this.config.maxSpreadTicks} ticks`,
      };
    }
    return { valid: true };
  }

  /**
   * Regla 7: Verificar volatilidad mínima
   */
  validateVolatility(volatilityTicks: number): ValidationResult {
    const minVolatility = this.config.minStopBufferTicks * 2; // Mínimo razonable
    if (volatilityTicks < minVolatility) {
      return {
        valid: false,
        reason: `Volatilidad insuficiente: ${volatilityTicks} ticks < mínimo ${minVolatility} ticks`,
      };
    }
    return { valid: true };
  }

  /**
   * Calcular el RR de un trade
   */
  calculateRR(entryPrice: number, stopLoss: number, takeProfit: number): number {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    return risk > 0 ? reward / risk : 0;
  }

  /**
   * Registrar una pérdida
   */
  recordLoss(amount: number): void {
    this.metrics.dailyLoss += amount;
    this.metrics.cumulativeDrawdown += amount;
  }

  /**
   * Registrar un trade ejecutado
   */
  recordTradeExecuted(): void {
    this.metrics.sessionTradeCount++;
  }

  /**
   * Resetear métricas de sesión (llamar al inicio de cada sesión)
   */
  resetSession(): void {
    this.metrics.sessionTradeCount = 0;
  }

  /**
   * Resetear métricas diarias (llamar al inicio de cada día)
   */
  resetDaily(): void {
    this.metrics.dailyLoss = 0;
  }

  /**
   * Obtener métricas actuales
   */
  getMetrics(): RiskMetrics {
    return { ...this.metrics };
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<RiskConfigType>): void {
    this.config = { ...this.config, ...config };
  }

  private initializeMetrics(): RiskMetrics {
    return {
      riskPerTrade: 0,
      rMultiple: 0,
      cumulativeDrawdown: 0,
      tradesRejected: 0,
      tradesApproved: 0,
      dailyLoss: 0,
      sessionTradeCount: 0,
    };
  }

  /**
   * Regla 1: Verificar capital disponible
   */
  private validateCapital(currentCapital: number): ValidationResult {
    if (currentCapital <= 0) {
      return {
        valid: false,
        reason: "Capital insuficiente: capital actual es 0 o negativo",
      };
    }

    const minCapitalRequired = this.config.initialCapital * 0.1; // Mínimo 10% del capital inicial
    if (currentCapital < minCapitalRequired) {
      return {
        valid: false,
        reason: `Capital insuficiente: ${currentCapital.toFixed(2)} < mínimo requerido ${minCapitalRequired.toFixed(2)}`,
      };
    }

    return { valid: true };
  }

  /**
   * Regla 2: Verificar que el riesgo no exceda el máximo permitido
   */
  private validateRiskPerTrade(input: RiskInput, proposedStopLoss: number, currentCapital: number): ValidationResult {
    const riskAmount = Math.abs(input.entryPrice - proposedStopLoss);
    const riskPct = (riskAmount / input.entryPrice) * 100;
    const maxRiskAmount = currentCapital * (this.config.maxRiskPerTradePct / 100);

    // Guardar para métricas
    this.metrics.riskPerTrade = riskPct;

    if (riskPct > this.config.maxRiskPerTradePct * 2) {
      return {
        valid: false,
        reason: `Riesgo por trade excesivo: ${riskPct.toFixed(2)}% > máximo ${this.config.maxRiskPerTradePct}%`,
      };
    }

    return { valid: true };
  }

  /**
   * Regla 3: Verificar ratio riesgo/beneficio mínimo
   */
  private validateRiskReward(input: RiskInput, proposedStopLoss: number, proposedTakeProfit: number): ValidationResult {
    const risk = Math.abs(input.entryPrice - proposedStopLoss);
    const reward = Math.abs(proposedTakeProfit - input.entryPrice);

    if (risk === 0) {
      return {
        valid: false,
        reason: "Riesgo calculado es 0 - SL inválido",
      };
    }

    const rr = reward / risk;

    if (rr < this.config.minRR) {
      return {
        valid: false,
        reason: `RR insuficiente: ${rr.toFixed(2)} < mínimo ${this.config.minRR}`,
      };
    }

    return { valid: true };
  }

  /**
   * Regla 4: Verificar pérdida diaria acumulada
   */
  private validateDailyLoss(currentCapital: number): ValidationResult {
    const maxDailyLossAmount = this.config.initialCapital * (this.config.maxDailyLossPct / 100);

    if (this.metrics.dailyLoss >= maxDailyLossAmount) {
      return {
        valid: false,
        reason: `Pérdida diaria máxima alcanzada: ${this.metrics.dailyLoss.toFixed(2)} >= ${maxDailyLossAmount.toFixed(2)}`,
      };
    }

    return { valid: true };
  }

  /**
   * Regla 5: Verificar número de trades en la sesión
   */
  private validateSessionTrades(): ValidationResult {
    if (this.metrics.sessionTradeCount >= this.config.maxTradesPerSession) {
      return {
        valid: false,
        reason: `Máximo de trades por sesión alcanzado: ${this.metrics.sessionTradeCount} >= ${this.config.maxTradesPerSession}`,
      };
    }

    return { valid: true };
  }
}
