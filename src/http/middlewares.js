import { performance } from 'node:perf_hooks';
import { ErrorDominio } from '../dominio/errores.js';

/**
 * Métrica de rendimiento del lado del servidor: cabecera Server-Timing.
 * El navegador la muestra en DevTools (pestaña Network → Timing) y el frontend
 * la lee con PerformanceResourceTiming.serverTiming para separar "tiempo de servidor" de "tiempo de red".
 */
export function serverTiming(req, res, next) {
  const inicio = performance.now();
  res.locals.timing = [];
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    const total = (performance.now() - inicio).toFixed(1);
    const extra = res.locals.timing.map((t) => (t.desc ? `${t.nombre};desc="${t.desc}"` : `${t.nombre};dur=${t.dur}`));
    res.setHeader('Server-Timing', [`app;dur=${total}`, ...extra].join(', '));
    return writeHead.apply(this, args);
  };
  next();
}

/** CORS: el frontend vive en otro origen (otro repositorio / otro puerto). */
export function cors(origenesPermitidos) {
  return (req, res, next) => {
    const origen = req.headers.origin;
    if (origen && origenesPermitidos.includes(origen)) {
      res.setHeader('Access-Control-Allow-Origin', origen);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Usuario-Id,X-Dispositivo-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Server-Timing,ETag');
      res.setHeader('Timing-Allow-Origin', origen);
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/**
 * Autenticación simulada para el Avance 1: el usuario viene en la cabecera X-Usuario-Id.
 * Se reemplazará por JWT en la siguiente entrega.
 */
export function usuarioActual(req, _res, next) {
  req.usuarioId = req.get('X-Usuario-Id') || null;
  next();
}

export function requiereUsuario(req, _res, next) {
  if (!req.usuarioId) return next(new ErrorDominio('Falta la cabecera X-Usuario-Id', 401));
  next();
}

/** Envuelve controladores async para que sus errores lleguen al manejador central. */
export const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function manejadorErrores(err, _req, res, _next) {
  if (err instanceof ErrorDominio) {
    return res.status(err.status).json({ error: err.message, tipo: err.name, actual: err.actual });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Archivo o cuerpo demasiado grande' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
}
