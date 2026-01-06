import { TradingSession } from "../signal/SignalTypes.js";

/**
 * SessionFilter - Filtro de sesiones de trading
 *
 * Según PRD sección 2.1, soporta sesiones: NY, LDN, ASIA
 */
export class SessionFilter {
  constructor(private enabledSessions: TradingSession[]) {}

  /**
   * Verifica si el timestamp está dentro de una sesión habilitada
   */
  isValid(timestamp: number): boolean {
    if (this.enabledSessions.length === 0) return true;

    const currentSession = this.getCurrentSession(timestamp);
    return currentSession !== null && this.enabledSessions.includes(currentSession);
  }

  /**
   * Obtiene la sesión actual basada en el timestamp
   */
  getCurrentSession(timestamp: number): TradingSession | null {
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const timeAsFloat = hour + minutes / 60;

    // ASIA session approx 00:00 - 08:00 UTC (Tokyo/Sydney)
    const isAsia = timeAsFloat >= 0 && timeAsFloat < 8;

    // London session approx 08:00 - 16:30 UTC
    const isLondon = timeAsFloat >= 8 && timeAsFloat < 16.5;

    // NY session approx 13:30 - 20:00 UTC (overlap con London de 13:30-16:30)
    const isNY = timeAsFloat >= 13.5 && timeAsFloat <= 20;

    // Prioridad: NY > LDN > ASIA (en caso de overlap)
    if (isNY) return "NY";
    if (isLondon) return "LDN";
    if (isAsia) return "ASIA";

    return null;
  }

  /**
   * Verifica si una sesión específica está habilitada
   */
  isSessionEnabled(session: TradingSession): boolean {
    return this.enabledSessions.includes(session);
  }

  /**
   * Obtiene las sesiones habilitadas
   */
  getEnabledSessions(): TradingSession[] {
    return [...this.enabledSessions];
  }

  /**
   * Actualiza las sesiones habilitadas
   */
  setEnabledSessions(sessions: TradingSession[]): void {
    this.enabledSessions = sessions;
  }

  /**
   * Obtiene información detallada de la sesión actual
   */
  getSessionInfo(timestamp: number): {
    currentSession: TradingSession | null;
    isValid: boolean;
    nextSessionStart?: { session: TradingSession; startsInMs: number };
  } {
    const currentSession = this.getCurrentSession(timestamp);
    const isValid = currentSession !== null && this.enabledSessions.includes(currentSession);

    return {
      currentSession,
      isValid,
    };
  }
}
