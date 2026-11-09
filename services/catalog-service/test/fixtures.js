import { createContainer } from '../src/container.js';

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Demo harvests (the same data the monolith tests used). */
export const demoHarvests = () => [
  { id: 'cos-1', producerId: 'p-rosa', product: 'Papa criolla', category: 'tubers', estimatedQuantity: 800, unitPrice: 2600, plantedOn: inDays(-110), availableOn: inDays(5), status: 'GROWING', description: 'Papa criolla de ladera, sin químicos en la última etapa.' },
  { id: 'cos-2', producerId: 'p-rosa', product: 'Arveja', category: 'vegetables', estimatedQuantity: 300, unitPrice: 4200, plantedOn: inDays(-80), availableOn: inDays(0), status: 'AVAILABLE' },
  { id: 'cos-3', producerId: 'p-jose', product: 'Lechuga', category: 'vegetables', unit: 'unidad', estimatedQuantity: 500, unitPrice: 1300, plantedOn: inDays(-50), availableOn: inDays(-2), status: 'AVAILABLE' },
  { id: 'cos-4', producerId: 'p-jose', product: 'Cebolla larga', category: 'vegetables', estimatedQuantity: 400, unitPrice: 1800, plantedOn: inDays(-20), availableOn: inDays(70), status: 'PLANTED' },
  { id: 'cos-5', producerId: 'p-carmen', product: 'Mora', category: 'fruits', estimatedQuantity: 250, unitPrice: 5200, plantedOn: inDays(-200), availableOn: inDays(12), status: 'GROWING' },
  { id: 'cos-6', producerId: 'p-carmen', product: 'Tomate de árbol', category: 'fruits', estimatedQuantity: 350, unitPrice: 3300, plantedOn: inDays(-300), availableOn: inDays(1), status: 'AVAILABLE' },
  { id: 'cos-7', producerId: 'p-luis', product: 'Fresa', category: 'fruits', estimatedQuantity: 150, unitPrice: 7800, plantedOn: inDays(-60), availableOn: inDays(25), status: 'GROWING' },
  { id: 'cos-8', producerId: 'p-luis', product: 'Zanahoria', category: 'tubers', estimatedQuantity: 600, unitPrice: 1600, plantedOn: inDays(-30), availableOn: inDays(60), status: 'PLANTED' },
];

/** Users as user-service returns them (UserDto shape). */
const USERS = [
  { id: 'p-rosa', role: 'PRODUCER', name: 'Rosa Pérez', farm: 'La Esperanza', village: 'El Rosal', town: 'Ventaquemada', location: { lat: 5.3667, lng: -73.5214 } },
  { id: 'p-jose', role: 'PRODUCER', name: 'José Rincón', farm: 'El Mirador', village: 'Puente de Piedra', town: 'Madrid', location: { lat: 4.7639, lng: -74.2794 } },
  { id: 'p-carmen', role: 'PRODUCER', name: 'Carmen Suárez', farm: 'Los Naranjos', village: 'Chinauta', town: 'Fusagasugá', location: { lat: 4.2731, lng: -74.4174 } },
  { id: 'p-luis', role: 'PRODUCER', name: 'Luis Gómez', farm: 'San Isidro', village: 'Fagua', town: 'Chía', location: { lat: 4.8961, lng: -74.0378 } },
  { id: 'c-ana', role: 'BUYER', name: 'Ana Torres', location: { lat: 4.6486, lng: -74.0628 } },
];

/** Test doubles of the gRPC clients of the other services (same interface). */
export class FakeUserClient {
  async getUser(id) {
    const user = USERS.find((u) => u.id === id);
    if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
    return user;
  }

  async getUsersByIds(ids) {
    return USERS.filter((u) => ids.includes(u.id));
  }

  async listProducers() {
    return USERS.filter((u) => u.role === 'PRODUCER');
  }
}

export class FakePricingClient {
  async evaluate(items) {
    return items.map(() => ({ evaluation: 'NO_REFERENCE', reference: null }));
  }
}

export class FakeReputationClient {
  async getReputation() {
    return { total: 0, score: 3.5, level: 'NEW', byCriterion: {}, recent: [] };
  }
}

export class FakeOrderClient {
  constructor() {
    this.harvestsWithOrders = new Set();
  }

  async hasOrdersForHarvest(harvestId) {
    return this.harvestsWithOrders.has(harvestId);
  }
}

export function createTestContainer({ withDemoData = true, photosDir } = {}) {
  const orderClient = new FakeOrderClient();
  return createContainer({
    harvests: withDemoData ? demoHarvests() : [],
    photosDir,
    clients: {
      userClient: new FakeUserClient(),
      pricingClient: new FakePricingClient(),
      reputationClient: new FakeReputationClient(),
      orderClient,
    },
  }).then((container) => ({ ...container, orderClient }));
}
