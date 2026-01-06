import { LiquidityZoneType } from "../signal/SignalTypes.js";

/**
 * Zonas de liquidez disponibles
 * Según PRD sección 2.1
 */
export interface LiquidityZones {
  /** Session Day High */
  sessionHigh?: number;
  /** Session Day Low */
  sessionLow?: number;
  /** Previous Day High */
  prevDayHigh?: number;
  /** Previous Day Low */
  prevDayLow?: number;
  /** Volume Weighted Average Price */
  vwap?: number;
  /** High Volume Node */
  hvn?: number;
  /** Low Volume Node */
  lvn?: number;
}

/**
 * Resultado de detección de zona de liquidez
 */
export interface LiquidityZoneResult {
  /** Si está cerca de una zona de liquidez */
  isNearZone: boolean;
  /** Tipo de zona más cercana */
  zoneType: LiquidityZoneType;
  /** Precio de la zona más cercana */
  zonePrice?: number;
  /** Distancia a la zona en precio */
  distance?: number;
  /** Distancia a la zona en porcentaje */
  distancePct?: number;
}

/**
 * LiquidityContext - Contexto de zonas de liquidez
 *
 * Según PRD sección 2.1, identifica tipos de zona:
 * PDH, PDL, SDH, SDL, VWAP, HVN, LVN, OTHER
 */
export class LiquidityContext {
  private defaultThreshold: number = 0.0005; // 0.05% proximity

  /**
   * Verifica si el precio está cerca de alguna zona de liquidez
   */
  isValid(currentPrice: number, zones: LiquidityZones): boolean {
    const result = this.detectZone(currentPrice, zones);
    return result.isNearZone;
  }

  /**
   * Detecta la zona de liquidez más cercana y su tipo
   */
  detectZone(currentPrice: number, zones: LiquidityZones, threshold?: number): LiquidityZoneResult {
    const proximityThreshold = threshold ?? this.defaultThreshold;

    // Mapeo de zonas a tipos
    const zoneMap: Array<{ price: number | undefined; type: LiquidityZoneType }> = [
      { price: zones.prevDayHigh, type: "PDH" },
      { price: zones.prevDayLow, type: "PDL" },
      { price: zones.sessionHigh, type: "SDH" },
      { price: zones.sessionLow, type: "SDL" },
      { price: zones.vwap, type: "VWAP" },
      { price: zones.hvn, type: "HVN" },
      { price: zones.lvn, type: "LVN" },
    ];

    let closestZone: { type: LiquidityZoneType; price: number; distance: number } | null = null;

    for (const zone of zoneMap) {
      if (zone.price === undefined) continue;

      const distance = Math.abs(currentPrice - zone.price);
      const distancePct = distance / zone.price;

      if (closestZone === null || distance < closestZone.distance) {
        closestZone = {
          type: zone.type,
          price: zone.price,
          distance,
        };
      }
    }

    // Si no hay zonas definidas
    if (closestZone === null) {
      return {
        isNearZone: false,
        zoneType: "OTHER",
      };
    }

    const distancePct = closestZone.distance / closestZone.price;
    const isNearZone = distancePct <= proximityThreshold;

    return {
      isNearZone,
      zoneType: isNearZone ? closestZone.type : "OTHER",
      zonePrice: closestZone.price,
      distance: closestZone.distance,
      distancePct,
    };
  }

  /**
   * Obtiene el objetivo de liquidez más cercano en la dirección del trade
   */
  getLiquidityTarget(
    currentPrice: number,
    direction: "LONG" | "SHORT",
    zones: LiquidityZones,
  ): { price: number; type: LiquidityZoneType } | null {
    // Para LONG, buscar zonas por encima del precio actual
    // Para SHORT, buscar zonas por debajo del precio actual

    const zoneMap: Array<{ price: number | undefined; type: LiquidityZoneType }> = [
      { price: zones.prevDayHigh, type: "PDH" },
      { price: zones.prevDayLow, type: "PDL" },
      { price: zones.sessionHigh, type: "SDH" },
      { price: zones.sessionLow, type: "SDL" },
      { price: zones.vwap, type: "VWAP" },
      { price: zones.hvn, type: "HVN" },
      { price: zones.lvn, type: "LVN" },
    ];

    let bestTarget: { price: number; type: LiquidityZoneType; distance: number } | null = null;

    for (const zone of zoneMap) {
      if (zone.price === undefined) continue;

      const isValidDirection = direction === "LONG" ? zone.price > currentPrice : zone.price < currentPrice;

      if (!isValidDirection) continue;

      const distance = Math.abs(zone.price - currentPrice);

      // Buscar el objetivo más cercano en la dirección correcta
      if (bestTarget === null || distance < bestTarget.distance) {
        bestTarget = {
          price: zone.price,
          type: zone.type,
          distance,
        };
      }
    }

    if (bestTarget === null) return null;

    return {
      price: bestTarget.price,
      type: bestTarget.type,
    };
  }

  /**
   * Actualiza el umbral de proximidad
   */
  setThreshold(threshold: number): void {
    this.defaultThreshold = threshold;
  }

  /**
   * Obtiene el umbral de proximidad actual
   */
  getThreshold(): number {
    return this.defaultThreshold;
  }
}
