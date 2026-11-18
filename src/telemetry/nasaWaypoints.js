// Proveedor de telemetría real: registro de paradas (waypoints) de Perseverance publicado por NASA
// Fuente: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
// En desarrollo se lee en vivo a través del proxy de Vite (/nasa → mars.nasa.gov).
// Si no hay conexión, se usa la copia reducida en /data/M20_waypoints.json.
import { solToUtc } from './mission.js';

export const NAMESPACE = 'nasa.m20';
const LIVE_URL = '/nasa/mmgis-maps/M20/Layers/json/M20_waypoints.json';
const SNAPSHOT_URL = '/data/M20_waypoints.json';
export const PUBLIC_URL = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';

// Campos del JSON de NASA que exponemos como datos
const FIELDS = {
  distance: { field: 'dist_total_m', name: 'Distance driven', unit: 'km', scale: 0.001, format: 'number', decimals: 2 },
  elevation: { field: 'elev_geoid', name: 'Elevation', unit: 'm', scale: 1, format: 'number', decimals: 0 },
  slope: { field: 'tilt', name: 'Ground slope', unit: '°', scale: 1, format: 'number', decimals: 1 },
};

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('json')) throw new Error(`${url} → ${res.status} ${type}`);
  return { json: await res.json(), lastModified: res.headers.get('last-modified') };
}

export function createNasaWaypointsProvider() {
  let loading = null;
  let source = null;

  // Descarga una sola vez y comparte el resultado entre todos los datos
  function load() {
    loading ??= (async () => {
      let result;
      try {
        result = await fetchJson(LIVE_URL);
        source = { mode: 'live', url: PUBLIC_URL, updated: result.lastModified };
      } catch {
        result = await fetchJson(SNAPSHOT_URL);
        source = { mode: 'snapshot', url: PUBLIC_URL, updated: result.json.snapshot?.lastModified ?? result.lastModified };
      }
      // Solo localizaciones de fin de conducción: las intermedias traen la distancia a 0
      const stops = result.json.features
        .map((f) => f.properties)
        .filter((p) => p.final === 'y')
        .sort((a, b) => a.sol - b.sol);
      return stops;
    })();
    return loading;
  }

  const supports = (object) => object.identifier.namespace === NAMESPACE;

  return {
    supportsMetadata: supports,
    supportsRequest: supports,

    getMetadata(object) {
      const def = FIELDS[object.identifier.key];
      return {
        values: [
          { key: 'sol', name: 'Sol', format: 'sol', hints: { domain: 1 } },
          { key: 'utc', name: 'Earth date', format: 'utc', hints: { domain: 2 } },
          { key: 'value', name: def.name, unit: def.unit, format: def.format, decimals: def.decimals, source: def.field, hints: { range: 1 } },
        ],
      };
    },

    async request(object) {
      const def = FIELDS[object.identifier.key];
      const stops = await load();
      return stops
        .filter((p) => Number.isFinite(p[def.field]) && p[def.field] > -9999)
        .map((p) => ({ sol: p.sol, utc: solToUtc(p.sol), value: p[def.field] * def.scale, rmc: p.RMC }));
    },

    getSource: () => source,
  };
}
