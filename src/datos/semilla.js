/**
 * Datos de demostración (zona rural de Boyacá / Cundinamarca).
 * Los precios de mercado son ilustrativos (COP por kg al consumidor en ciudad);
 * en producción vendrían de una fuente oficial como el SIPSA del DANE.
 */

const enDias = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const usuarios = [
  { id: 'p-rosa', rol: 'PRODUCTOR', nombre: 'Rosa Pérez', telefono: '3001234567', finca: 'La Esperanza', vereda: 'El Rosal', municipio: 'Ventaquemada', ubicacion: { lat: 5.3667, lng: -73.5214 }, cultivos: ['papa criolla', 'arveja'] },
  { id: 'p-jose', rol: 'PRODUCTOR', nombre: 'José Rincón', telefono: '3109876543', finca: 'El Mirador', vereda: 'Puente de Piedra', municipio: 'Madrid', ubicacion: { lat: 4.7639, lng: -74.2794 }, cultivos: ['lechuga', 'cebolla larga'] },
  { id: 'p-carmen', rol: 'PRODUCTOR', nombre: 'Carmen Suárez', telefono: '3205551122', finca: 'Los Naranjos', vereda: 'Chinauta', municipio: 'Fusagasugá', ubicacion: { lat: 4.2731, lng: -74.4174 }, cultivos: ['mora', 'tomate de árbol'] },
  { id: 'p-luis', rol: 'PRODUCTOR', nombre: 'Luis Gómez', telefono: '3157778899', finca: 'San Isidro', vereda: 'Fagua', municipio: 'Chía', ubicacion: { lat: 4.8961, lng: -74.0378 }, cultivos: ['fresa', 'zanahoria'] },
  { id: 'c-ana', rol: 'COMPRADOR', tipo: 'CONSUMIDOR', nombre: 'Ana Torres', ubicacion: { lat: 4.6486, lng: -74.0628 } },
  { id: 'c-tienda', rol: 'COMPRADOR', tipo: 'TIENDA', nombre: 'Tienda Don Pedro', ubicacion: { lat: 4.7110, lng: -74.0721 } },
  { id: 'c-resto', rol: 'COMPRADOR', tipo: 'RESTAURANTE', nombre: 'Restaurante La Huerta', ubicacion: { lat: 4.6097, lng: -74.0817 } },
];

export const cosechas = [
  { id: 'cos-1', productorId: 'p-rosa', producto: 'Papa criolla', categoria: 'tuberculos', cantidadEstimada: 800, precioUnitario: 2600, fechaSiembra: enDias(-110), fechaDisponible: enDias(5), estado: 'EN_CRECIMIENTO', descripcion: 'Papa criolla de ladera, sin químicos en la última etapa.' },
  { id: 'cos-2', productorId: 'p-rosa', producto: 'Arveja', categoria: 'hortalizas', cantidadEstimada: 300, precioUnitario: 4200, fechaSiembra: enDias(-80), fechaDisponible: enDias(0), estado: 'DISPONIBLE' },
  { id: 'cos-3', productorId: 'p-jose', producto: 'Lechuga', categoria: 'hortalizas', unidad: 'unidad', cantidadEstimada: 500, precioUnitario: 1300, fechaSiembra: enDias(-50), fechaDisponible: enDias(-2), estado: 'DISPONIBLE' },
  { id: 'cos-4', productorId: 'p-jose', producto: 'Cebolla larga', categoria: 'hortalizas', cantidadEstimada: 400, precioUnitario: 1800, fechaSiembra: enDias(-20), fechaDisponible: enDias(70), estado: 'SEMBRADO' },
  { id: 'cos-5', productorId: 'p-carmen', producto: 'Mora', categoria: 'frutas', cantidadEstimada: 250, precioUnitario: 5200, fechaSiembra: enDias(-200), fechaDisponible: enDias(12), estado: 'EN_CRECIMIENTO' },
  { id: 'cos-6', productorId: 'p-carmen', producto: 'Tomate de árbol', categoria: 'frutas', cantidadEstimada: 350, precioUnitario: 3300, fechaSiembra: enDias(-300), fechaDisponible: enDias(1), estado: 'DISPONIBLE' },
  { id: 'cos-7', productorId: 'p-luis', producto: 'Fresa', categoria: 'frutas', cantidadEstimada: 150, precioUnitario: 7800, fechaSiembra: enDias(-60), fechaDisponible: enDias(25), estado: 'EN_CRECIMIENTO' },
  { id: 'cos-8', productorId: 'p-luis', producto: 'Zanahoria', categoria: 'tuberculos', cantidadEstimada: 600, precioUnitario: 1600, fechaSiembra: enDias(-30), fechaDisponible: enDias(60), estado: 'SEMBRADO' },
];

/** Precio promedio al consumidor en ciudad y lo que típicamente paga el intermediario en finca (COP/kg o unidad). */
export const preciosMercado = [
  ['papa criolla', { precioMercado: 4000, precioIntermediario: 1300, unidad: 'kg' }],
  ['arveja', { precioMercado: 6500, precioIntermediario: 2200, unidad: 'kg' }],
  ['lechuga', { precioMercado: 2000, precioIntermediario: 600, unidad: 'unidad' }],
  ['cebolla larga', { precioMercado: 2800, precioIntermediario: 900, unidad: 'kg' }],
  ['mora', { precioMercado: 8000, precioIntermediario: 2800, unidad: 'kg' }],
  ['tomate de árbol', { precioMercado: 5000, precioIntermediario: 1700, unidad: 'kg' }],
  ['fresa', { precioMercado: 11000, precioIntermediario: 4000, unidad: 'kg' }],
  ['zanahoria', { precioMercado: 2500, precioIntermediario: 800, unidad: 'kg' }],
];

export const calificaciones = [
  { reservaId: 'r-hist-1', deUsuarioId: 'c-ana', aUsuarioId: 'p-rosa', puntajes: { calidad: 5, cumplimiento: 5 }, comentario: 'Papa excelente y puntual.' },
  { reservaId: 'r-hist-2', deUsuarioId: 'c-resto', aUsuarioId: 'p-rosa', puntajes: { calidad: 5, cumplimiento: 4 } },
  { reservaId: 'r-hist-3', deUsuarioId: 'c-tienda', aUsuarioId: 'p-rosa', puntajes: { calidad: 4, cumplimiento: 5 } },
  { reservaId: 'r-hist-4', deUsuarioId: 'c-ana', aUsuarioId: 'p-jose', puntajes: { calidad: 3, cumplimiento: 2 }, comentario: 'Llegó un día tarde.' },
  { reservaId: 'r-hist-1', deUsuarioId: 'p-rosa', aUsuarioId: 'c-ana', puntajes: { pagoATiempo: 5, seriedad: 5 } },
];
