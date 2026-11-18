// Calendario de la misión Mars 2020: conversión entre fecha terrestre y sol
// Un sol (día marciano) dura 88 775.244 s. Aterrizaje: 2021-02-18 20:55 UTC, a las ~15:53 hora solar local
// (sol 0), así que el sol 0 empezó unas 0.662 sol antes del aterrizaje.

export const SOL_MS = 88775244;
export const LANDING_UTC = Date.parse('2021-02-18T20:55:00Z');
export const SOL0_UTC = LANDING_UTC - 0.662 * SOL_MS;

export const solToUtc = (sol) => SOL0_UTC + sol * SOL_MS;
export const utcToSol = (utc) => (utc - SOL0_UTC) / SOL_MS;
export const currentSol = (now = Date.now()) => Math.floor(utcToSol(now));
