import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearContenedor } from '../src/contenedor.js';
import { crearApp } from '../src/app.js';

test('sync offline: crea, es idempotente y reporta conflictos', async () => {
  const c = await crearContenedor();
  const crear = { opId: 'op-1', tipo: 'CREAR_COSECHA', entidadId: 'nueva-1', marcaTiempo: new Date().toISOString(),
    datos: { producto: 'Haba', cantidadEstimada: 50, precioUnitario: 3000, fechaDisponible: '2026-12-01' } };

  const r1 = await c.syncService.aplicarLote({ dispositivoId: 'cel-A', productorId: 'p-rosa', operaciones: [crear] });
  assert.equal(r1.resultados[0].estado, 'APLICADA');

  const r2 = await c.syncService.aplicarLote({ dispositivoId: 'cel-A', productorId: 'p-rosa', operaciones: [crear] });
  assert.equal(r2.resultados[0].repetida, true);
  assert.equal((await c.repoCosechas.listar((x) => x.producto === 'Haba')).length, 1);

  // Dispositivo B cambia el precio "ahora"; A sincroniza un cambio de precio hecho hace una hora
  await c.cosechaService.actualizar('nueva-1', { precioUnitario: 3500 }, { productorId: 'p-rosa' });
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
  const r3 = await c.syncService.aplicarLote({ dispositivoId: 'cel-A', productorId: 'p-rosa', operaciones: [
    { opId: 'op-2', tipo: 'ACTUALIZAR_COSECHA', entidadId: 'nueva-1', marcaTiempo: haceUnaHora, datos: { precioUnitario: 2000, descripcion: 'Haba verde' } },
  ] });
  assert.equal(r3.resultados[0].estado, 'PARCIAL');
  assert.deepEqual(r3.resultados[0].conflictos, ['precioUnitario']);
  assert.equal(r3.resultados[0].entidad.precioUnitario, 3500);
  assert.equal(r3.resultados[0].entidad.descripcion, 'Haba verde');
});

test('sync rechaza ediciones a cosechas ajenas sin romper el lote', async () => {
  const c = await crearContenedor();
  const { resultados } = await c.syncService.aplicarLote({ productorId: 'p-jose', operaciones: [
    { opId: 'x1', tipo: 'ACTUALIZAR_COSECHA', entidadId: 'cos-1', marcaTiempo: new Date().toISOString(), datos: { precioUnitario: 1 } },
  ] });
  assert.equal(resultados[0].estado, 'RECHAZADA');
});

test('reserva → entrega → calificación mutua', async () => {
  const c = await crearContenedor();
  const reserva = await c.reservaService.crear({ cosechaId: 'cos-2', compradorId: 'c-ana', cantidad: 20 });
  assert.equal((await c.repoCosechas.obtener('cos-2')).cantidadReservada, 20);

  await assert.rejects(c.reputacionService.calificar({ reservaId: reserva.id, deUsuarioId: 'c-ana', puntajes: { calidad: 5, cumplimiento: 5 } }), /entregada/);
  await assert.rejects(c.reservaService.cambiarEstado(reserva.id, 'CONFIRMADA', 'c-ana'), /Solo el productor/);
  await c.reservaService.cambiarEstado(reserva.id, 'CONFIRMADA', 'p-rosa');
  await c.reservaService.cambiarEstado(reserva.id, 'ENTREGADA', 'p-rosa');

  await c.reputacionService.calificar({ reservaId: reserva.id, deUsuarioId: 'c-ana', puntajes: { calidad: 5, cumplimiento: 4 } });
  await c.reputacionService.calificar({ reservaId: reserva.id, deUsuarioId: 'p-rosa', puntajes: { pagoATiempo: 5, seriedad: 5 } });
  await assert.rejects(c.reputacionService.calificar({ reservaId: reserva.id, deUsuarioId: 'p-rosa', puntajes: { pagoATiempo: 1, seriedad: 1 } }), /Ya calificó/);
  assert.equal((await c.reputacionService.reputacionDe('c-ana')).total, 2);
});

test('cancelar una reserva devuelve la cantidad a la cosecha', async () => {
  const c = await crearContenedor();
  const reserva = await c.reservaService.crear({ cosechaId: 'cos-1', compradorId: 'c-tienda', cantidad: 100 });
  await c.reservaService.cambiarEstado(reserva.id, 'CANCELADA', 'c-tienda');
  assert.equal((await c.repoCosechas.obtener('cos-1')).cantidadReservada, 0);
});

test('catálogo por cercanía ordena por distancia y filtra por radio', async () => {
  const c = await crearContenedor();
  const items = await c.catalogoService.catalogo({ lat: 4.6486, lng: -74.0628, radioKm: 40 });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.distanciaKm <= 40));
  assert.ok(items.every((i, k) => k === 0 || items[k - 1].distanciaKm <= i.distanciaKm));
});

test('HTTP: SSR con caché ISR (MISS → HIT → invalidación) y Server-Timing', async () => {
  const c = await crearContenedor();
  const servidor = crearApp(c).listen(0);
  const base = `http://localhost:${servidor.address().port}`;
  try {
    const r1 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r1.headers.get('x-cache-isr'), 'MISS');
    assert.match(await r1.text(), /La Esperanza/);
    assert.match(r1.headers.get('server-timing'), /app;dur=/);

    const r2 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r2.headers.get('x-cache-isr'), 'HIT');

    await c.cosechaService.actualizar('cos-1', { precioUnitario: 2700 }, { productorId: 'p-rosa' });
    const r3 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r3.headers.get('x-cache-isr'), 'MISS');

    const api = await fetch(`${base}/api/catalogo`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(api.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  } finally {
    servidor.close();
  }
});
