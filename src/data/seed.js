/**
 * Demo data (rural area of Boyacá / Cundinamarca).
 * The server only creates the demo accounts; products and ratings are used by the automated tests.
 * Market prices are illustrative (COP per kg paid by a consumer in the city);
 * in production they would come from an official source such as SIPSA (DANE).
 */

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Every demo account uses this password. */
export const DEMO_PASSWORD = 'campo123';

export const users = [
  { id: 'p-rosa', email: 'rosa@delcampo.co', password: DEMO_PASSWORD, role: 'PRODUCER', name: 'Rosa Pérez', phone: '3001234567', farm: 'La Esperanza', village: 'El Rosal', town: 'Ventaquemada', location: { lat: 5.3667, lng: -73.5214 }, crops: ['papa criolla', 'arveja'] },
  { id: 'p-jose', email: 'jose@delcampo.co', password: DEMO_PASSWORD, role: 'PRODUCER', name: 'José Rincón', phone: '3109876543', farm: 'El Mirador', village: 'Puente de Piedra', town: 'Madrid', location: { lat: 4.7639, lng: -74.2794 }, crops: ['lechuga', 'cebolla larga'] },
  { id: 'p-carmen', email: 'carmen@delcampo.co', password: DEMO_PASSWORD, role: 'PRODUCER', name: 'Carmen Suárez', phone: '3205551122', farm: 'Los Naranjos', village: 'Chinauta', town: 'Fusagasugá', location: { lat: 4.2731, lng: -74.4174 }, crops: ['mora', 'tomate de árbol'] },
  { id: 'p-luis', email: 'luis@delcampo.co', password: DEMO_PASSWORD, role: 'PRODUCER', name: 'Luis Gómez', phone: '3157778899', farm: 'San Isidro', village: 'Fagua', town: 'Chía', location: { lat: 4.8961, lng: -74.0378 }, crops: ['fresa', 'zanahoria'] },
  { id: 'c-ana', email: 'ana@delcampo.co', password: DEMO_PASSWORD, role: 'BUYER', type: 'CONSUMER', name: 'Ana Torres', location: { lat: 4.6486, lng: -74.0628 } },
  { id: 'c-tienda', email: 'tienda@delcampo.co', password: DEMO_PASSWORD, role: 'BUYER', type: 'STORE', name: 'Tienda Don Pedro', location: { lat: 4.7110, lng: -74.0721 } },
  { id: 'c-resto', email: 'restaurante@delcampo.co', password: DEMO_PASSWORD, role: 'BUYER', type: 'RESTAURANT', name: 'Restaurante La Huerta', location: { lat: 4.6097, lng: -74.0817 } },
];

export const harvests = [
  { id: 'cos-1', producerId: 'p-rosa', product: 'Papa criolla', category: 'tubers', estimatedQuantity: 800, unitPrice: 2600, plantedOn: inDays(-110), availableOn: inDays(5), status: 'GROWING', description: 'Papa criolla de ladera, sin químicos en la última etapa.' },
  { id: 'cos-2', producerId: 'p-rosa', product: 'Arveja', category: 'vegetables', estimatedQuantity: 300, unitPrice: 4200, plantedOn: inDays(-80), availableOn: inDays(0), status: 'AVAILABLE' },
  { id: 'cos-3', producerId: 'p-jose', product: 'Lechuga', category: 'vegetables', unit: 'unidad', estimatedQuantity: 500, unitPrice: 1300, plantedOn: inDays(-50), availableOn: inDays(-2), status: 'AVAILABLE' },
  { id: 'cos-4', producerId: 'p-jose', product: 'Cebolla larga', category: 'vegetables', estimatedQuantity: 400, unitPrice: 1800, plantedOn: inDays(-20), availableOn: inDays(70), status: 'PLANTED' },
  { id: 'cos-5', producerId: 'p-carmen', product: 'Mora', category: 'fruits', estimatedQuantity: 250, unitPrice: 5200, plantedOn: inDays(-200), availableOn: inDays(12), status: 'GROWING' },
  { id: 'cos-6', producerId: 'p-carmen', product: 'Tomate de árbol', category: 'fruits', estimatedQuantity: 350, unitPrice: 3300, plantedOn: inDays(-300), availableOn: inDays(1), status: 'AVAILABLE' },
  { id: 'cos-7', producerId: 'p-luis', product: 'Fresa', category: 'fruits', estimatedQuantity: 150, unitPrice: 7800, plantedOn: inDays(-60), availableOn: inDays(25), status: 'GROWING' },
  { id: 'cos-8', producerId: 'p-luis', product: 'Zanahoria', category: 'tubers', estimatedQuantity: 600, unitPrice: 1600, plantedOn: inDays(-30), availableOn: inDays(60), status: 'PLANTED' },
];

/** Average consumer price in the city and what a middleman typically pays at the farm (COP per kg or unit). */
export const marketPrices = [
  ['papa criolla', { marketPrice: 4000, middlemanPrice: 1300, unit: 'kg' }],
  ['arveja', { marketPrice: 6500, middlemanPrice: 2200, unit: 'kg' }],
  ['lechuga', { marketPrice: 2000, middlemanPrice: 600, unit: 'unidad' }],
  ['cebolla larga', { marketPrice: 2800, middlemanPrice: 900, unit: 'kg' }],
  ['mora', { marketPrice: 8000, middlemanPrice: 2800, unit: 'kg' }],
  ['tomate de árbol', { marketPrice: 5000, middlemanPrice: 1700, unit: 'kg' }],
  ['fresa', { marketPrice: 11000, middlemanPrice: 4000, unit: 'kg' }],
  ['zanahoria', { marketPrice: 2500, middlemanPrice: 800, unit: 'kg' }],
];

export const ratings = [
  { orderId: 'r-hist-1', fromUserId: 'c-ana', toUserId: 'p-rosa', scores: { quality: 5, reliability: 5 }, comment: 'Papa excelente y puntual.' },
  { orderId: 'r-hist-2', fromUserId: 'c-resto', toUserId: 'p-rosa', scores: { quality: 5, reliability: 4 } },
  { orderId: 'r-hist-3', fromUserId: 'c-tienda', toUserId: 'p-rosa', scores: { quality: 4, reliability: 5 } },
  { orderId: 'r-hist-4', fromUserId: 'c-ana', toUserId: 'p-jose', scores: { quality: 3, reliability: 2 }, comment: 'Llegó un día tarde.' },
  { orderId: 'r-hist-1', fromUserId: 'p-rosa', toUserId: 'c-ana', scores: { paysOnTime: 5, seriousness: 5 } },
];
