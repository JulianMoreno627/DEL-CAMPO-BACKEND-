import { Router } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { asyncHandler, requireUser, requireRole } from './middlewares.js';
import { DomainError } from '../domain/errors.js';
import { producerPage } from '../render/pages.js';
import { EventBus } from '../services/EventBus.js';

const IMAGE_EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Receives the photo already compressed by the client's Web Worker (WebP, ~800 px), saves it and exposes its public URL. */
const receivePhoto = (uploadsDir) => [
  express.raw({ type: Object.keys(IMAGE_EXTENSIONS), limit: '600kb' }),
  asyncHandler(async (req, res, next) => {
    const extension = IMAGE_EXTENSIONS[req.get('Content-Type')];
    if (!extension || !req.body?.length) throw new DomainError('Envíe una imagen WebP, JPEG o PNG');
    await mkdir(uploadsDir, { recursive: true });
    const fileName = `${randomUUID()}.${extension}`;
    await writeFile(path.join(uploadsDir, fileName), req.body);
    res.locals.photo = `/uploads/${fileName}`;
    next();
  }),
];

/** REST API (JSON). */
export function apiRoutes(c, { uploadsDir }) {
  const r = Router();

  r.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // ---- Login with two profiles: PRODUCER or BUYER
  r.post('/auth/register', asyncHandler(async (req, res) => res.status(201).json(await c.authService.register(req.body ?? {}))));
  r.post('/auth/login', asyncHandler(async (req, res) => {
    const { email, password, role } = req.body ?? {};
    res.json(await c.authService.login({ email, password, role }));
  }));
  r.get('/auth/me', requireUser, asyncHandler(async (req, res) => res.json(await c.userRepo.getOrFail(req.userId))));

  r.get('/users/:id/reputation', asyncHandler(async (req, res) => res.json(await c.reputationService.reputationOf(req.params.id))));

  // ---- Seasonal catalog and proximity
  r.get('/catalog', asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm, category, status, maxDays } = req.query;
    res.set('Cache-Control', 'no-cache'); // the browser revalidates with ETag → 304 with no body if unchanged
    res.json(await c.catalogService.catalog({ lat, lng, radiusKm, category, status, maxDays }));
  }));
  r.get('/season', asyncHandler(async (_req, res) => res.json(await c.catalogService.season())));
  r.get('/producers/nearby', asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm } = req.query;
    if (lat == null || lng == null) throw new DomainError('lat y lng son obligatorios');
    res.json(await c.catalogService.nearbyProducers({ lat, lng, radiusKm }));
  }));
  r.get('/producers/:id', asyncHandler(async (req, res) => res.json(await c.catalogService.producerProfile(req.params.id))));
  r.get('/prices/:product', asyncHandler(async (req, res) => {
    const reference = c.priceCalculator.reference(req.params.product);
    if (!reference) throw new DomainError('Sin precio de referencia para ese producto', 404);
    res.json(reference);
  }));

  // ---- Listings: the producer publishes what they grow; the buyer sees them (price only)
  r.get('/listings', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(await c.listingService.list({ search: req.query.q }));
  }));
  r.get('/listings/mine', requireRole('PRODUCER'), asyncHandler(async (req, res) => res.json(await c.listingService.byProducer(req.userId))));
  r.get('/listings/:id', asyncHandler(async (req, res) => res.json(await c.listingService.get(req.params.id))));
  r.post('/listings', requireRole('PRODUCER'), asyncHandler(async (req, res) => {
    const { product, description, price, quantity, unit, category, availableOn } = req.body ?? {};
    res.status(201).json(await c.listingService.publish(req.userId,
      { product, description, price, quantity, unit, category, availableOn }));
  }));
  r.patch('/listings/:id', requireRole('PRODUCER'), asyncHandler(async (req, res) => {
    const { product, description, price, quantity, availableOn } = req.body ?? {};
    res.json(await c.listingService.edit(req.params.id, req.userId, { product, description, price, quantity, availableOn }));
  }));
  r.delete('/listings/:id', requireRole('PRODUCER'), asyncHandler(async (req, res) => {
    await c.listingService.remove(req.params.id, req.userId);
    res.sendStatus(204);
  }));
  r.post('/listings/:id/photo', requireRole('PRODUCER'), ...receivePhoto(uploadsDir), asyncHandler(async (req, res) => {
    res.status(201).json(await c.listingService.edit(req.params.id, req.userId, { photo: res.locals.photo }));
  }));

  // ---- Shopping cart (buyer)
  r.get('/cart', requireRole('BUYER'), asyncHandler(async (req, res) => res.json(await c.cartService.view(req.userId))));
  r.post('/cart/items', requireRole('BUYER'), asyncHandler(async (req, res) => {
    const { listingId, quantity = 1 } = req.body ?? {};
    res.status(201).json(await c.cartService.add(req.userId, listingId, quantity));
  }));
  r.patch('/cart/items/:listingId', requireRole('BUYER'), asyncHandler(async (req, res) => {
    res.json(await c.cartService.changeQuantity(req.userId, req.params.listingId, req.body?.quantity));
  }));
  r.delete('/cart/items/:listingId', requireRole('BUYER'), asyncHandler(async (req, res) => {
    res.json(await c.cartService.remove(req.userId, req.params.listingId));
  }));
  r.delete('/cart', requireRole('BUYER'), asyncHandler(async (req, res) => res.json(await c.cartService.clear(req.userId))));
  r.post('/cart/checkout', requireRole('BUYER'), asyncHandler(async (req, res) => {
    res.status(201).json(await c.cartService.checkout(req.userId));
  }));

  // ---- Harvests (producer)
  r.post('/harvests', requireUser, asyncHandler(async (req, res) => {
    const harvest = await c.harvestService.create({ ...req.body, producerId: req.userId });
    res.status(201).json(harvest);
  }));
  r.patch('/harvests/:id', requireUser, asyncHandler(async (req, res) => {
    const { harvest, applied, conflicts } = await c.harvestService.update(
      req.params.id, req.body, { producerId: req.userId });
    res.json({ harvest, applied, conflicts });
  }));
  r.post('/harvests/:id/photo', requireUser, ...receivePhoto(uploadsDir), asyncHandler(async (req, res) => {
    const { harvest } = await c.harvestService.update(req.params.id, { photo: res.locals.photo }, { producerId: req.userId });
    res.status(201).json(harvest);
  }));

  // ---- Offline synchronization
  r.post('/sync', requireUser, asyncHandler(async (req, res) => {
    res.json(await c.syncService.applyBatch({
      deviceId: req.get('X-Device-Id') ?? 'unknown',
      producerId: req.userId,
      operations: req.body.operations,
    }));
  }));

  // ---- Orders (batch orders)
  r.get('/orders', requireUser, asyncHandler(async (req, res) => {
    const user = await c.userRepo.getOrFail(req.userId);
    const filter = user.role === 'PRODUCER' ? { producerId: user.id } : { buyerId: user.id };
    res.json(await c.orderService.list(filter));
  }));
  r.post('/orders', requireUser, asyncHandler(async (req, res) => {
    const { harvestId, quantity } = req.body;
    res.status(201).json(await c.orderService.create({ harvestId, quantity, buyerId: req.userId }));
  }));
  r.patch('/orders/:id', requireUser, asyncHandler(async (req, res) => {
    res.json(await c.orderService.changeStatus(req.params.id, req.body.status, req.userId));
  }));

  // ---- Two-way reputation
  r.post('/ratings', requireUser, asyncHandler(async (req, res) => {
    const { orderId, scores, comment } = req.body;
    res.status(201).json(await c.reputationService.rate({ orderId, scores, comment, fromUserId: req.userId }));
  }));

  // ---- Real-user performance metrics (RUM). sendBeacon sends text/plain to avoid a CORS preflight.
  r.post('/metrics', express.text({ type: 'text/plain', limit: '32kb' }), (req, res) => {
    try {
      c.metricsService.record(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    } catch { /* a malformed metric must not break anything */ }
    res.sendStatus(204);
  });
  r.get('/metrics/summary', (_req, res) => res.json(c.metricsService.summary()));

  return r;
}

/** HTML pages rendered on the server (SSR with ISR cache). Their URLs stay in Spanish because users see them. */
export function pageRoutes(c, { isrCache, frontendUrl }) {
  const r = Router();

  // Event-based invalidation: if a harvest changes, its producer's page is regenerated on the next visit.
  c.bus.on(EventBus.HARVEST_CHANGED, (harvest) => isrCache.invalidate(`/productores/${harvest.producerId}`));

  // The root leads to the app (login); the calendar stays at /temporada/
  r.get('/', (_req, res) => res.redirect(frontendUrl));

  r.get('/productores/:id', asyncHandler(async (req, res) => {
    const key = `/productores/${req.params.id}`;
    const { html, status } = await isrCache.get(key, async () =>
      producerPage(await c.catalogService.producerProfile(req.params.id), { frontendUrl }));
    res.locals.timing.push({ name: 'isr', desc: status });
    res.set('X-Cache-ISR', status);
    res.type('html').send(html);
  }));

  return r;
}
