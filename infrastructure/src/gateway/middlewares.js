import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { DomainError, ServiceUnavailable, runWithContext } from '@del-campo/shared';

/**
 * Server-side performance metric: the Server-Timing header.
 * Besides the total time of the gateway (app), each gRPC call made to answer the request
 * is listed (e.g. catalog.GetCatalog;dur=4.2), so DevTools shows where the time went.
 */
export function serverTiming(_req, res, next) {
  const start = performance.now();
  res.locals.timing = [];
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    const total = (performance.now() - start).toFixed(1);
    const extra = res.locals.timing.map((t) => (t.desc ? `${t.name};desc="${t.desc}"` : `${t.name};dur=${t.dur.toFixed(1)}`));
    res.setHeader('Server-Timing', [`app;dur=${total}`, ...extra].join(', '));
    return writeHead.apply(this, args);
  };
  next();
}

/** CORS: the frontend lives on another origin (Vercel). Only the origins in ALLOWED_ORIGINS. */
export function cors(allowedOrigins) {
  const allowed = new Set(allowedOrigins.map((o) => o.replace(/\/$/, '')));
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Device-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Server-Timing,ETag');
      res.setHeader('Timing-Allow-Origin', origin);
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

const VALID_REQUEST_ID = /^[\w-]{1,100}$/;

/**
 * Session and request context.
 * - The token is verified HERE, locally, with the shared TOKEN_SECRET (no gRPC call per request).
 *   If it is valid, req.userId and req.role are set; otherwise the request goes on as anonymous.
 * - req.context (x-request-id, user, role, timings) is what the gRPC clients propagate in the
 *   metadata of every call to the microservices (asyncHandler activates it).
 */
export function requestContext(sessionToken) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
    const session = scheme === 'Bearer' ? sessionToken.verify(token) : null;
    req.userId = session?.sub ?? null;
    req.role = session?.role ?? null;

    const incoming = req.get('X-Request-Id');
    const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    req.context = { requestId, userId: req.userId, role: req.role, timings: res.locals.timing };
    next();
  };
}

export function requireUser(req, _res, next) {
  if (!req.userId) return next(new DomainError('Inicie sesión para continuar', 401));
  next();
}

/** Restricts a route to one profile: PRODUCER (publishes listings) or BUYER (uses the cart). */
export const requireRole = (role) => (req, res, next) => requireUser(req, res, (error) => {
  if (error) return next(error);
  if (req.role !== role) {
    return next(new DomainError(role === 'PRODUCER' ? 'Solo los productores pueden hacer esto' : 'Solo los compradores pueden hacer esto', 403));
  }
  next();
});

/**
 * Wraps async controllers: runs them inside the request context (the body parsers of Express
 * may lose AsyncLocalStorage on their stream callbacks, so it is activated here, right before
 * the controller) and sends their errors to the central handler.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  runWithContext(req.context ?? {}, () => Promise.resolve(fn(req, res, next))).catch(next);

/**
 * Same error format as before the migration: { error, type, current }.
 * The domain errors arrive from the microservices with their original HTTP status (see shared/errorMapping).
 */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof DomainError) {
    return res.status(err.status).json({ error: err.message, type: err.name, current: err.current });
  }
  if (err instanceof ServiceUnavailable) {
    console.error(`[gateway] ${err.message}`);
    return res.status(503).json({ error: 'Servicio temporalmente no disponible, intente de nuevo' });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Archivo o cuerpo demasiado grande' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
}
