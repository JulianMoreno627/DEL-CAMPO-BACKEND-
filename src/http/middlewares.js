import { performance } from 'node:perf_hooks';
import { DomainError } from '../domain/errors.js';

/**
 * Server-side performance metric: the Server-Timing header.
 * The browser shows it in DevTools (Network tab → Timing) and the frontend
 * reads it with PerformanceResourceTiming.serverTiming to split "server time" from "network time".
 */
export function serverTiming(req, res, next) {
  const start = performance.now();
  res.locals.timing = [];
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    const total = (performance.now() - start).toFixed(1);
    const extra = res.locals.timing.map((t) => (t.desc ? `${t.name};desc="${t.desc}"` : `${t.name};dur=${t.dur}`));
    res.setHeader('Server-Timing', [`app;dur=${total}`, ...extra].join(', '));
    return writeHead.apply(this, args);
  };
  next();
}

/** CORS: the frontend lives on another origin (another repository / another port). */
export function cors(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    // Si la petición viene de un origen, lo permitimos dinámicamente
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Device-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Server-Timing,ETag');
      res.setHeader('Timing-Allow-Origin', origin);
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/**
 * Session: the client sends the token it got at login in "Authorization: Bearer <token>".
 * If it is valid, req.userId and req.role are set; otherwise the request goes on as anonymous.
 */
export function currentUser(authService) {
  return (req, _res, next) => {
    const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
    const session = scheme === 'Bearer' ? authService.verifyToken(token) : null;
    req.userId = session?.sub ?? null;
    req.role = session?.role ?? null;
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

/** Wraps async controllers so their errors reach the central handler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, _req, res, _next) {
  if (err instanceof DomainError) {
    return res.status(err.status).json({ error: err.message, type: err.name, current: err.current });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Archivo o cuerpo demasiado grande' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
}
