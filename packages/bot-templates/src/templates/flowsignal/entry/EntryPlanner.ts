import { FlowSignal } from "../signal/SignalTypes.js";

export interface EntryOrder {
  type: "LIMIT";
  price: number;
  side: "buy" | "sell";
  quantity: number;
}

export class EntryPlanner {
  planEntry(signal: FlowSignal, quantity: number): EntryOrder {
    return {
      type: "LIMIT",
      price: signal.entryPlan.price,
      side: signal.direction === "LONG" ? "buy" : "sell",
      quantity,
    };
  }
}
