export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export type SwingType = "H" | "L" | "HH" | "HL" | "LH" | "LL";

export interface Swing {
  type: SwingType;
  price: number;
  timestamp: number;
}

export class SwingDetector {
  private lastSwings: Swing[] = [];

  update(candles: Candle[]): Swing | null {
    if (candles.length < 3) return null;

    const prev = candles[candles.length - 3];
    const curr = candles[candles.length - 2];
    const next = candles[candles.length - 1];

    let newSwing: Swing | null = null;

    // Swing High
    if (curr.high > prev.high && curr.high > next.high) {
      const type = this.determineHighType(curr.high);
      newSwing = { type, price: curr.high, timestamp: curr.timestamp };
    }
    // Swing Low
    else if (curr.low < prev.low && curr.low < next.low) {
      const type = this.determineLowType(curr.low);
      newSwing = { type, price: curr.low, timestamp: curr.timestamp };
    }

    if (newSwing) {
      this.lastSwings.push(newSwing);
      if (this.lastSwings.length > 20) this.lastSwings.shift();
    }

    return newSwing;
  }

  getLastSwings() {
    return this.lastSwings;
  }

  private determineHighType(price: number): SwingType {
    const lastHigh = this.lastSwings.filter((s) => s.type === "H" || s.type === "HH" || s.type === "LH").pop();
    if (!lastHigh) return "H";
    return price > lastHigh.price ? "HH" : "LH";
  }

  private determineLowType(price: number): SwingType {
    const lastLow = this.lastSwings.filter((s) => s.type === "L" || s.type === "HL" || s.type === "LL").pop();
    if (!lastLow) return "L";
    return price < lastLow.price ? "LL" : "HL";
  }
}
