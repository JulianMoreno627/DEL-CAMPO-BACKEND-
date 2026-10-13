import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cors, serverTiming, usuarioActual, manejadorErrores } from './http/middlewares.js';
import { rutasApi, rutasPaginas } from './http/rutas.js';
import { CacheIsr } from './render/CacheIsr.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function crearApp(contenedor, {
  frontendUrl = 'http://localhost:5173',
  origenesPermitidos = [frontendUrl],
  revalidarSegundos = 60,
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(serverTiming);
  app.use(compression()); // gzip: reduce el consumo de datos de JSON y HTML
  app.use(cors(origenesPermitidos));
  app.use(usuarioActual);
  app.use(express.json({ limit: '256kb' }));

  // Archivos estáticos: páginas SSG (generadas en build) y fotos subidas
  app.use(express.static(path.join(raiz, 'public'), { maxAge: '1h' }));

  app.use('/api', rutasApi(contenedor, { dirUploads: path.join(raiz, 'public', 'uploads') }));
  app.use(rutasPaginas(contenedor, { cacheIsr: new CacheIsr({ revalidarSegundos }), frontendUrl }));

  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(manejadorErrores);
  return app;
}
