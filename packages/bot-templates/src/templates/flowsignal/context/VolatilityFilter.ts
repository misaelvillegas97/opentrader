import { Candle } from "../structure/SwingDetector.js";

export class VolatilityFilter {
  constructor(
    private minRangeTicks: number,
    private tickSize: number,
  ) {}

  isValid(candles: Candle[]): boolean {
    if (candles.length === 0) return false;

    // Simplification: Check the range of the last 10 candles
    const window = candles.slice(-10);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));

    const rangeTicks = (high - low) / this.tickSize;
    return rangeTicks >= this.minRangeTicks;
  }
}
