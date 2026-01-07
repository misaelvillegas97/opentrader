export interface Trade {
  price: number;
  amount: number;
  side: "buy" | "sell";
  timestamp: number;
}

export class DeltaCalculator {
  private deltas: number[] = [];
  private currentCandleDelta: number = 0;

  addTrade(trade: Trade) {
    if (trade.side === "buy") {
      this.currentCandleDelta += trade.amount;
    } else {
      this.currentCandleDelta -= trade.amount;
    }
  }

  onCandleClosed(): number {
    const delta = this.currentCandleDelta;
    this.deltas.push(delta);
    this.currentCandleDelta = 0;

    // Limit buffer to last 1000 candles for percentile calculation
    if (this.deltas.length > 1000) {
      this.deltas.shift();
    }
    return delta;
  }

  getCurrentDelta(): number {
    return this.currentCandleDelta;
  }

  getPercentile(currentDelta: number): number {
    if (this.deltas.length === 0) return 0;
    const absDeltas = this.deltas.map(Math.abs);
    const absCurrent = Math.abs(currentDelta);
    const count = absDeltas.filter((d) => d < absCurrent).length;
    return (count / absDeltas.length) * 100;
  }

  hasSufficientHistory(minSamples: number): boolean {
    if (this.deltas.length < minSamples) return false;
    return this.deltas.slice(-minSamples).some((delta) => delta !== 0);
  }

  calculateCVD(): number {
    return this.deltas.reduce((acc, curr) => acc + curr, 0);
  }
}
