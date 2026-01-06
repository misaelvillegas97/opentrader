import { Swing, SwingDetector } from "./SwingDetector.js";

export class StructureValidator {
  isValid(side: "buy" | "sell", currentPrice: number, swingDetector: SwingDetector): boolean {
    const swings = swingDetector.getLastSwings();
    if (swings.length === 0) return true;

    if (side === "sell") {
      // Looking for SHORT (Absorption of buyers at top)
      const lastHigh = swings.filter((s: Swing) => s.type === "H" || s.type === "HH" || s.type === "LH").pop();
      return lastHigh ? currentPrice >= lastHigh.price * 0.9995 : true;
    } else {
      // Looking for LONG (Absorption of sellers at bottom)
      const lastLow = swings.filter((s: Swing) => s.type === "L" || s.type === "HL" || s.type === "LL").pop();
      return lastLow ? currentPrice <= lastLow.price * 1.0005 : true;
    }
  }
}
