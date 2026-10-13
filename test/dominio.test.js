import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cosecha, EstadoCosecha } from '../src/dominio/Cosecha.js';
import { Reserva } from '../src/dominio/Reserva.js';
import { Coordenada } from '../src/dominio/Coordenada.js';
import { Productor, Comprador, Usuario } from '../src/dominio/Usuario.js';
import { Reputacion, Calificacion } from '../src/dominio/Reputacion.js';
import { CalculadoraPrecioJusto } from '../src/dominio/PrecioReferencia.js';
import { TransicionInvalida, ErrorDominio } from '../src/dominio/errores.js';

const nuevaCosecha = (extra = {}) => new Cosecha({
  productorId: 'p1', producto: 'Papa criolla', cantidadEstimada: 100, precioUnitario: 2500,
  fechaDisponible: '2026-11-01', ...extra,
});

test('la cosecha sigue la máquina de estados sembrado → crecimiento → disponible → agotado', () => {
  const c = nuevaCosecha();
  assert.equal(c.estado, EstadoCosecha.SEMBRADO);
  c.avanzarA('EN_CRECIMIENTO');
  c.avanzarA('DISPONIBLE');
  c.avanzarA('AGOTADO');
  assert.equal(c.estado, 'AGOTADO');
  assert.throws(() => c.avanzarA('DISPONIBLE'), TransicionInvalida);
});

test('no se puede saltar estados', () => {
  assert.throws(() => nuevaCosecha().avanzarA('DISPONIBLE'), TransicionInvalida);
});

test('reserva anticipada descuenta lo libre y agota cuando está disponible', () => {
  const c = nuevaCosecha({ estado: 'DISPONIBLE' });
  c.reservar(60);
  assert.equal(c.cantidadLibre, 40);
  assert.throws(() => c.reservar(41), /Solo quedan 40/);
  c.reservar(40);
  assert.equal(c.estado, 'AGOTADO');
  assert.equal(c.admiteReservas(), false);
});

test('se puede reservar una cosecha que aún está creciendo', () => {
  const c = nuevaCosecha({ estado: 'EN_CRECIMIENTO' });
  c.reservar(100);
  assert.equal(c.estado, 'EN_CRECIMIENTO'); // no se agota hasta estar disponible
  assert.equal(c.admiteReservas(), false);
});

test('no se puede estimar menos de lo ya reservado', () => {
  const c = nuevaCosecha();
  c.reservar(70);
  assert.throws(() => c.aplicarCambios({ cantidadEstimada: 50 }), /reservados/);
  assert.equal(c.cantidadEstimada, 100);
});

test('aplicarCambios resuelve conflictos campo por campo (Last-Writer-Wins)', () => {
  const c = nuevaCosecha();
  c.aplicarCambios({ precioUnitario: 2800 }, '2026-10-10T10:00:00.000Z');
  // Cambio offline hecho ANTES (09:00) en otro dispositivo: el precio pierde, la cantidad se aplica
  const r = c.aplicarCambios({ precioUnitario: 2000, cantidadEstimada: 120 }, '2026-10-10T09:00:00.000Z');
  assert.deepEqual(r.aplicados, ['cantidadEstimada']);
  assert.deepEqual(r.conflictos, ['precioUnitario']);
  assert.equal(c.precioUnitario, 2800);
  assert.equal(c.cantidadEstimada, 120);
});

test('aplicarCambios es atómico: si un campo es inválido no cambia nada', () => {
  const c = nuevaCosecha();
  assert.throws(() => c.aplicarCambios({ precioUnitario: 3000, estado: 'AGOTADO' }), TransicionInvalida);
  assert.equal(c.precioUnitario, 2500);
  assert.equal(c.version, 1);
});

test('la reserva sigue su ciclo y calcula el total', () => {
  const r = new Reserva({ cosechaId: 'c', productorId: 'p', compradorId: 'b', cantidad: 10, precioUnitario: 2500 });
  assert.equal(r.total, 25000);
  r.cambiarEstado('CONFIRMADA');
  r.cambiarEstado('ENTREGADA');
  assert.equal(r.finalizada, true);
  assert.throws(() => r.cambiarEstado('CANCELADA'), TransicionInvalida);
});

test('Usuario es abstracta y las subclases definen sus criterios (polimorfismo)', () => {
  assert.throws(() => new Usuario({ nombre: 'x', ubicacion: { lat: 0, lng: 0 } }), TypeError);
  const p = new Productor({ nombre: 'Rosa', vereda: 'El Rosal', ubicacion: { lat: 5, lng: -73 } });
  const b = new Comprador({ nombre: 'Ana', ubicacion: { lat: 4.6, lng: -74 } });
  assert.deepEqual(p.criteriosDeCalificacion(), ['calidad', 'cumplimiento']);
  assert.deepEqual(b.criteriosDeCalificacion(), ['pagoATiempo', 'seriedad']);
});

test('distancia Haversine Bogotá–Tunja ≈ 115 km', () => {
  const d = new Coordenada(4.711, -74.0721).distanciaKm(new Coordenada(5.5353, -73.3678));
  assert.ok(d > 110 && d < 125, `distancia ${d}`);
  assert.throws(() => new Coordenada(100, 0), ErrorDominio);
});

test('reputación bayesiana: pocas calificaciones se acercan a la media', () => {
  const una = new Reputacion([new Calificacion({ reservaId: 'r', deUsuarioId: 'a', aUsuarioId: 'b', puntajes: { calidad: 5 } })]);
  assert.equal(una.puntaje, 3.88);
  assert.equal(una.nivel, 'NUEVO');
  assert.throws(() => new Calificacion({ reservaId: 'r', deUsuarioId: 'a', aUsuarioId: 'b', puntajes: { calidad: 6 } }), /1 a 5/);
});

test('precio justo: evalúa contra el rango sugerido de mercado', () => {
  const calc = new CalculadoraPrecioJusto(new Map([['papa criolla', { precioMercado: 4000, precioIntermediario: 1300, unidad: 'kg' }]]));
  assert.deepEqual(calc.referencia('Papa criolla').rangoJusto, { minimo: 2400, maximo: 3400 });
  assert.equal(calc.evaluar('Papa criolla', 1300), 'BAJO');
  assert.equal(calc.evaluar('Papa criolla', 3000), 'JUSTO');
  assert.equal(calc.evaluar('Papa criolla', 3900), 'ALTO');
  assert.equal(calc.evaluar('Yuca', 1000), 'SIN_REFERENCIA');
});
