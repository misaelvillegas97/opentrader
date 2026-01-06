/**
 * Risk Engine Module
 *
 * Motor de riesgo independiente para gestión profesional de trades.
 *
 * Exporta:
 * - RiskEngine: Orquestador principal
 * - Componentes individuales para uso avanzado
 * - Tipos e interfaces
 * - Configuración
 */

// Main Engine
export { RiskEngine, RiskEngineOptions, EvaluationResult } from "./RiskEngine.js";

// Types
export {
  RiskInput,
  RiskDecision,
  ValidationResult,
  TradeState,
  TradeStatus,
  RiskMetrics,
  TradeUpdateEvent,
  VolatilityData,
} from "./types.js";

// Config
export { RiskConfig, RiskConfigType } from "./config/risk.config.js";

// Validator
export { RiskValidator } from "./validator/RiskValidator.js";

// Stop Loss
export { StructuralStopLoss, StopLossResult } from "./stoploss/StructuralStopLoss.js";

// Take Profit
export { LiquidityTakeProfit, TakeProfitResult } from "./takeprofit/LiquidityTakeProfit.js";

// Position Sizing
export { FixedFractionalSizer, SizingResult, SizingOptions } from "./sizing/FixedFractionalSizer.js";

// Trade Management
export { TradeManager, TradeManagerOptions, MarketContext, SwingPoint } from "./management/TradeManager.js";
