// Proveedor calculado: tiempo de luz Tierra–Marte en vivo
// Posiciones heliocéntricas con los elementos orbitales aproximados de JPL
// ("Approximate Positions of the Planets", Tabla 1, válida 1800–2050).

import { SOL0_UTC, utcToSol } from './mission.js';

const AU_KM = 149597870.7;
const C_KM_S = 299792.458;
const DEG = Math.PI / 180;

// [a (UA), e, I (°), L (°), ϖ (°), Ω (°)] y sus tasas por siglo juliano
const ELEMENTS = {
  earth: {
    base: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    base: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
};

// Posición heliocéntrica eclíptica (UA) de un planeta en una fecha (ms Unix)
export function heliocentric(planet, timeMs) {
  const T = (timeMs / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const { base, rate } = ELEMENTS[planet];
  const [a, e, I, L, varpi, node] = base.map((v, i) => v + rate[i] * T);
  const omega = (varpi - node) * DEG;
  let M = ((L - varpi) % 360) * DEG;
  // Ecuación de Kepler (Newton)
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(node * DEG), sO = Math.sin(node * DEG);
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cI = Math.cos(I * DEG), sI = Math.sin(I * DEG);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  };
}

export function earthMarsDistanceKm(timeMs) {
  const a = heliocentric('earth', timeMs);
  const b = heliocentric('mars', timeMs);
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * AU_KM;
}

// Tiempo de luz en segundos (una dirección)
export function lightTimeSeconds(timeMs) {
  return earthMarsDistanceKm(timeMs) / C_KM_S;
}

// --- Proveedor de telemetría (patrón Open MCT) ---

export const LIGHT_NAMESPACE = 'computed';
const HISTORY_STEP_MS = 86400000; // un punto por día terrestre
const LIVE_PERIOD_MS = 1000;      // actualización en vivo cada segundo

const datumAt = (utc) => ({ utc, sol: utcToSol(utc), value: lightTimeSeconds(utc) / 60 });

export function createLightTimeProvider() {
  const supports = (o) => o.identifier.namespace === LIGHT_NAMESPACE && o.identifier.key === 'lightTime';
  return {
    supportsMetadata: supports,
    supportsRequest: supports,
    supportsSubscribe: supports,

    getMetadata() {
      return {
        values: [
          { key: 'sol', name: 'Sol', format: 'sol', hints: { domain: 1 } },
          { key: 'utc', name: 'Earth date', format: 'utc', hints: { domain: 2 } },
          { key: 'value', name: 'Light time', unit: 'min', format: 'duration', hints: { range: 1 } },
        ],
      };
    },

    // Toda la misión, desde el sol 0 hasta ahora
    async request(object, { start = SOL0_UTC, end = Date.now() } = {}) {
      const data = [];
      for (let t = start; t < end; t += HISTORY_STEP_MS) data.push(datumAt(t));
      data.push(datumAt(end));
      return data;
    },

    subscribe(object, callback) {
      const id = setInterval(() => callback(datumAt(Date.now())), LIVE_PERIOD_MS);
      return () => clearInterval(id);
    },

    getSource: () => ({ mode: 'computed', label: 'JPL orbital elements' }),
  };
}
