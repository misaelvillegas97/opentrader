import { Candle } from "../structure/SwingDetector.js";

export class VolatilityFilter {
  constructor(private minRangeTicks: number) {}

  isValid(candles: Candle[]): boolean {
    if (candles.length === 0) return false;

    // Simplification: Check the range of the last 10 candles
    const window = candles.slice(-10);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));

    // In a real scenario, we'd need the tick size to calculate range in ticks.
    // For now, we assume price is already in ticks or use a multiplier.
    // Let's assume price difference is what we check.
    return high - low >= this.minRangeTicks;
  }
}
