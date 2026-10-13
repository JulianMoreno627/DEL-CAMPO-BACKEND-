import { Router } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { asincrono, requiereUsuario } from './middlewares.js';
import { ErrorDominio } from '../dominio/errores.js';
import { paginaProductor } from '../render/paginas.js';
import { BusEventos } from '../servicios/BusEventos.js';

const EXTENSIONES_IMAGEN = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** API REST (JSON). */
export function rutasApi(c, { dirUploads }) {
  const r = Router();

  r.get('/salud', (_req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

  // Usuarios de demostración (selector de "quién soy" mientras no hay login)
  r.get('/usuarios', asincrono(async (_req, res) => res.json(await c.repoUsuarios.listar())));
  r.get('/usuarios/:id/reputacion', asincrono(async (req, res) => res.json(await c.reputacionService.reputacionDe(req.params.id))));

  // ---- Catálogo por temporada y cercanía
  r.get('/catalogo', asincrono(async (req, res) => {
    const { lat, lng, radioKm, categoria, estado, diasMax } = req.query;
    res.set('Cache-Control', 'no-cache'); // el navegador revalida con ETag → 304 sin cuerpo si no cambió
    res.json(await c.catalogoService.catalogo({ lat, lng, radioKm, categoria, estado, diasMax }));
  }));
  r.get('/temporada', asincrono(async (_req, res) => res.json(await c.catalogoService.temporada())));
  r.get('/productores/cercanos', asincrono(async (req, res) => {
    const { lat, lng, radioKm } = req.query;
    if (lat == null || lng == null) throw new ErrorDominio('lat y lng son obligatorios');
    res.json(await c.catalogoService.productoresCercanos({ lat, lng, radioKm }));
  }));
  r.get('/productores/:id', asincrono(async (req, res) => res.json(await c.catalogoService.perfilProductor(req.params.id))));
  r.get('/precios/:producto', asincrono(async (req, res) => {
    const ref = c.calculadoraPrecio.referencia(req.params.producto);
    if (!ref) throw new ErrorDominio('Sin precio de referencia para ese producto', 404);
    res.json(ref);
  }));

  // ---- Cosechas (productor)
  r.post('/cosechas', requiereUsuario, asincrono(async (req, res) => {
    const cosecha = await c.cosechaService.crear({ ...req.body, productorId: req.usuarioId });
    res.status(201).json(cosecha);
  }));
  r.patch('/cosechas/:id', requiereUsuario, asincrono(async (req, res) => {
    const { cosecha, aplicados, conflictos } = await c.cosechaService.actualizar(
      req.params.id, req.body, { productorId: req.usuarioId });
    res.json({ cosecha, aplicados, conflictos });
  }));
  // La foto llega YA comprimida por el Web Worker del cliente (WebP, ~800 px)
  r.post('/cosechas/:id/foto', requiereUsuario,
    express.raw({ type: Object.keys(EXTENSIONES_IMAGEN), limit: '600kb' }),
    asincrono(async (req, res) => {
      const ext = EXTENSIONES_IMAGEN[req.get('Content-Type')];
      if (!ext || !req.body?.length) throw new ErrorDominio('Envíe una imagen WebP, JPEG o PNG');
      await mkdir(dirUploads, { recursive: true });
      const nombre = `${randomUUID()}.${ext}`;
      await writeFile(path.join(dirUploads, nombre), req.body);
      const { cosecha } = await c.cosechaService.actualizar(
        req.params.id, { foto: `/uploads/${nombre}` }, { productorId: req.usuarioId });
      res.status(201).json(cosecha);
    }));

  // ---- Sincronización offline
  r.post('/sync', requiereUsuario, asincrono(async (req, res) => {
    res.json(await c.syncService.aplicarLote({
      dispositivoId: req.get('X-Dispositivo-Id') ?? 'desconocido',
      productorId: req.usuarioId,
      operaciones: req.body.operaciones,
    }));
  }));

  // ---- Reservas (pedidos por lote)
  r.get('/reservas', requiereUsuario, asincrono(async (req, res) => {
    const usuario = await c.repoUsuarios.obtenerOFallar(req.usuarioId);
    const filtro = usuario.rol === 'PRODUCTOR' ? { productorId: usuario.id } : { compradorId: usuario.id };
    res.json(await c.reservaService.listar(filtro));
  }));
  r.post('/reservas', requiereUsuario, asincrono(async (req, res) => {
    const { cosechaId, cantidad } = req.body;
    res.status(201).json(await c.reservaService.crear({ cosechaId, cantidad, compradorId: req.usuarioId }));
  }));
  r.patch('/reservas/:id', requiereUsuario, asincrono(async (req, res) => {
    res.json(await c.reservaService.cambiarEstado(req.params.id, req.body.estado, req.usuarioId));
  }));

  // ---- Reputación bidireccional
  r.post('/calificaciones', requiereUsuario, asincrono(async (req, res) => {
    const { reservaId, puntajes, comentario } = req.body;
    res.status(201).json(await c.reputacionService.calificar({ reservaId, puntajes, comentario, deUsuarioId: req.usuarioId }));
  }));

  // ---- Métricas de rendimiento reales (RUM). sendBeacon envía text/plain para evitar preflight CORS.
  r.post('/metricas', express.text({ type: 'text/plain', limit: '32kb' }), (req, res) => {
    try {
      c.metricasService.registrar(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    } catch { /* una métrica mal formada no debe romper nada */ }
    res.sendStatus(204);
  });
  r.get('/metricas/resumen', (_req, res) => res.json(c.metricasService.resumen()));

  return r;
}

/** Páginas HTML renderizadas en el servidor (SSR con caché ISR). */
export function rutasPaginas(c, { cacheIsr, frontendUrl }) {
  const r = Router();

  // Invalidación por evento: si cambia una cosecha, la página de su productor se regenera en la próxima visita.
  c.bus.on(BusEventos.COSECHA_CAMBIADA, (cosecha) => cacheIsr.invalidar(`/productores/${cosecha.productorId}`));

  r.get('/', (_req, res) => res.redirect('/temporada/'));

  r.get('/productores/:id', asincrono(async (req, res) => {
    const clave = `/productores/${req.params.id}`;
    const { html, estado } = await cacheIsr.obtener(clave, async () =>
      paginaProductor(await c.catalogoService.perfilProductor(req.params.id), { frontendUrl }));
    res.locals.timing.push({ nombre: 'isr', desc: estado });
    res.set('X-Cache-ISR', estado);
    res.type('html').send(html);
  }));

  return r;
}
