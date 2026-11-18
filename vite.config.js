// Configuración de Vite: proxy hacia NASA para leer los waypoints de Perseverance
// (el servidor de NASA no envía cabeceras CORS, así que el navegador no puede pedirlos directamente)
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/nasa': {
        target: 'https://mars.nasa.gov',
        changeOrigin: true,
        // User-Agent propio y fijo: la CDN de NASA rechaza (403) el de Chrome headless de `npm run check`
        headers: { 'User-Agent': 'perseverance-sim/0.1 (vite dev proxy)' },
        rewrite: (path) => path.replace(/^\/nasa/, ''),
      },
    },
  },
});
