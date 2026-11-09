import express, { Router } from 'express';
import { asyncHandler, requireUser, requireRole } from './middlewares.js';
import { rawPhoto } from './controllers/photoUpload.js';
import { producerPage } from '../render/pages.js';
import { profileJson } from './restMappers.js';

/**
 * REST API (JSON) for the frontend: the SAME routes, bodies and status codes as before the migration.
 * Each route only checks the session / profile and delegates to a controller that translates REST ↔ gRPC.
 *
 * @param {object} c controllers
 */
export function apiRoutes(c) {
  const r = Router();
  const h = asyncHandler;
  const producer = requireRole('PRODUCER');
  const buyer = requireRole('BUYER');

  r.get('/health', h(c.system.health));

  // ---- Login with two profiles: PRODUCER or BUYER (user-service)
  r.post('/auth/register', h(c.auth.register));
  r.post('/auth/login', h(c.auth.login));
  r.get('/auth/me', requireUser, h(c.auth.me));

  r.get('/users/:id/reputation', h(c.order.reputationOf));

  // ---- Seasonal catalog and proximity (catalog, user, pricing)
  r.get('/catalog', h(c.catalog.catalogItems));
  r.get('/season', h(c.catalog.season));
  r.get('/producers/nearby', h(c.catalog.nearbyProducers));
  r.get('/producers/:id', h(c.catalog.producer));
  r.get('/prices/:product', h(c.catalog.price));

  // ---- Listings (catalog-service)
  r.get('/listings', h(c.listing.list));
  r.get('/listings/mine', producer, h(c.listing.mine));
  r.get('/listings/:id', h(c.listing.get));
  r.post('/listings', producer, h(c.listing.publish));
  r.patch('/listings/:id', producer, h(c.listing.edit));
  r.delete('/listings/:id', producer, h(c.listing.remove));
  r.post('/listings/:id/photo', producer, rawPhoto, h(c.listing.uploadPhoto));

  // ---- Shopping cart (cart-service) and checkout saga (order-service)
  r.get('/cart', buyer, h(c.cart.view));
  r.post('/cart/items', buyer, h(c.cart.add));
  r.patch('/cart/items/:listingId', buyer, h(c.cart.changeQuantity));
  r.delete('/cart/items/:listingId', buyer, h(c.cart.remove));
  r.delete('/cart', buyer, h(c.cart.clear));
  r.post('/cart/checkout', buyer, h(c.cart.checkout));

  // ---- Harvests and offline synchronization (catalog-service)
  r.post('/harvests', requireUser, h(c.harvest.create));
  r.patch('/harvests/:id', requireUser, h(c.harvest.update));
  r.post('/harvests/:id/photo', requireUser, rawPhoto, h(c.harvest.uploadPhoto));
  r.post('/sync', requireUser, h(c.harvest.sync));

  // ---- Orders (order-service) and two-way reputation (reputation-service)
  r.get('/orders', requireUser, h(c.order.list));
  r.post('/orders', requireUser, h(c.order.create));
  r.patch('/orders/:id', requireUser, h(c.order.changeStatus));
  r.post('/ratings', requireUser, h(c.order.rate));

  // ---- Real-user performance metrics (RUM). sendBeacon sends text/plain to avoid a CORS preflight.
  r.post('/metrics', express.text({ type: 'text/plain', limit: '32kb' }), c.system.recordMetrics);
  r.get('/metrics/summary', c.system.metricsSummary);

  return r;
}

/**
 * HTML pages rendered on the server. Their URLs stay in Spanish because users see them.
 * /productores/:id → SSR + ISR (60 s cache, invalidated by the WatchHarvestChanges stream).
 */
export function pageRoutes({ catalog, isrCache, frontendUrl }) {
  const r = Router();

  // The root leads to the app (login); the calendar stays at /temporada/ (SSG)
  r.get('/', (_req, res) => res.redirect(frontendUrl));

  r.get('/productores/:id', asyncHandler(async (req, res) => {
    const key = `/productores/${req.params.id}`;
    const { html, status } = await isrCache.get(key, async () =>
      producerPage(profileJson(await catalog.call('GetProducerProfile', { producerId: req.params.id })), { frontendUrl }));
    res.locals.timing.push({ name: 'isr', desc: status });
    res.set('X-Cache-ISR', status);
    res.type('html').send(html);
  }));

  return r;
}
