import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cors, serverTiming, currentUser, errorHandler } from './http/middlewares.js';
import { apiRoutes, pageRoutes } from './http/routes.js';
import { IsrCache } from './render/IsrCache.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(container, {
  frontendUrl = 'http://localhost:5173',
  allowedOrigins = [frontendUrl],
  revalidateSeconds = 60,
  uploadsDir = path.join(root, 'public', 'uploads'),
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(serverTiming);
  app.use(compression()); // gzip: reduces the data used by JSON and HTML
  app.use(cors(allowedOrigins));
  app.use(currentUser(container.authService));
  app.use(express.json({ limit: '256kb' }));

  // Static files: uploaded photos and SSG pages (generated at build time)
  app.use('/uploads', express.static(uploadsDir, { maxAge: '1h' }));
  app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));

  app.use('/api', apiRoutes(container, { uploadsDir }));
  app.use(pageRoutes(container, { isrCache: new IsrCache({ revalidateSeconds }), frontendUrl }));

  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(errorHandler);
  return app;
}
