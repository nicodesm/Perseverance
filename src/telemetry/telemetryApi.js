// Mini "Telemetry API" siguiendo el patrón de NASA Open MCT:
// - cada dato es un objeto con identificador (namespace + key)
// - los proveedores se registran y dicen qué objetos soportan (supportsRequest / supportsSubscribe)
// - los metadatos describen los campos: un dominio (tiempo / sol) y un rango (el valor, con unidad)
// Ver Open MCT: src/api/telemetry/TelemetryAPI.js (addProvider, request, subscribe, getMetadata)

export function createTelemetryAPI() {
  const providers = [];

  const find = (method, object) => providers.find((p) => p[method]?.(object));

  return {
    addProvider(provider) {
      providers.unshift(provider); // como Open MCT: el más reciente tiene prioridad
    },

    getMetadata(object) {
      const provider = find('supportsMetadata', object);
      if (!provider) throw new Error(`Sin metadatos para ${keyString(object)}`);
      return provider.getMetadata(object);
    },

    // Datos históricos: Promise de [{ sol, utc, value }] ordenados por tiempo
    async request(object, options = {}) {
      const provider = find('supportsRequest', object);
      if (!provider) throw new Error(`Sin proveedor de historial para ${keyString(object)}`);
      return provider.request(object, options);
    },

    // Datos en vivo: llama a callback(datum) y devuelve la función para cancelar
    subscribe(object, callback) {
      const provider = find('supportsSubscribe', object);
      return provider ? provider.subscribe(object, callback) : () => {};
    },

    // Información del origen (para mostrar "en vivo" o "copia guardada")
    getSource(object) {
      return find('supportsRequest', object)?.getSource?.(object) ?? null;
    },
  };
}

export const keyString = (object) => `${object.identifier.namespace}:${object.identifier.key}`;
