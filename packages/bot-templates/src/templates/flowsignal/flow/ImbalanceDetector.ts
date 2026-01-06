export class ImbalanceDetector {
  detect(bids: [number, number][], asks: [number, number][]): "LONG" | "SHORT" | null {
    // Basic imbalance: compare top of book volume or sum of volumes
    const bidVol = bids.reduce((acc, curr) => acc + curr[1], 0);
    const askVol = asks.reduce((acc, curr) => acc + curr[1], 0);

    if (bidVol > askVol * 2) return "LONG";
    if (askVol > bidVol * 2) return "SHORT";

    return null;
  }
}
