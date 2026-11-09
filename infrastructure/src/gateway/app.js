import express from 'express';
import compression from 'compression';
import { serverTiming, cors, requestContext, errorHandler } from './middlewares.js';
import { apiRoutes, pageRoutes } from './routes.js';
import { AuthController } from './controllers/AuthController.js';
import { ListingController } from './controllers/ListingController.js';
import { CartController } from './controllers/CartController.js';
import { OrderController } from './controllers/OrderController.js';
import { CatalogController } from './controllers/CatalogController.js';
import { HarvestController } from './controllers/HarvestController.js';
import { SystemController } from './controllers/SystemController.js';

/**
 * API Gateway: the only HTTP entry point (public PORT). Frontend → gateway is REST;
 * gateway → microservices is gRPC only.
 *
 * @param {object} deps
 * @param {Record<string, import('@del-campo/shared').GrpcClient>} deps.clients user, catalog, cart, order, reputation, pricing
 * @param {import('@del-campo/shared').SessionToken} deps.sessionToken verifies the session locally
 * @param {import('../render/IsrCache.js').IsrCache} deps.isrCache
 * @param {import('../metrics/MetricsService.js').MetricsService} deps.metricsService
 * @param {() => Promise<object>} deps.healthProbe
 * @param {string} deps.frontendUrl
 * @param {string[]} deps.allowedOrigins
 * @param {string} deps.uploadsDir photos written by catalog-service
 * @param {string} deps.publicDir static files (SSG page /temporada/)
 */
export function createGateway({
  clients, sessionToken, isrCache, metricsService, healthProbe, frontendUrl, allowedOrigins, uploadsDir, publicDir,
}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(serverTiming);
  app.use(compression()); // gzip: reduces the data used by JSON and HTML
  app.use(cors(allowedOrigins));
  app.use(requestContext(sessionToken));
  app.use(express.json({ limit: '256kb' }));

  // Static files: uploaded photos and SSG pages (generated at build time)
  app.use('/uploads', express.static(uploadsDir, { maxAge: '1h' }));
  app.use(express.static(publicDir, { maxAge: '1h' }));

  const controllers = {
    auth: new AuthController(clients),
    listing: new ListingController(clients),
    cart: new CartController(clients),
    order: new OrderController(clients),
    catalog: new CatalogController(clients),
    harvest: new HarvestController(clients),
    system: new SystemController({ healthProbe, metricsService }),
  };
  app.use('/api', apiRoutes(controllers));
  app.use(pageRoutes({ catalog: clients.catalog, isrCache, frontendUrl }));

  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(errorHandler);
  return app;
}
