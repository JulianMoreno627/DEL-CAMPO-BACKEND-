import { DomainError, NotFound, ServiceUnavailable } from '@del-campo/shared';
import { createContainer } from '../src/container.js';

/**
 * Test double of catalog-service with the same reservation rules seen from outside
 * (free quantity, 409 when there is not enough). It can simulate failures.
 */
export class FakeCatalogClient {
  constructor() {
    this.harvests = new Map([
      ['cos-2', { id: 'cos-2', producerId: 'p-rosa', product: 'Arveja', unit: 'kg', availableOn: '2026-11-09', unitPrice: 4200, estimated: 300, reserved: 0 }],
      ['cos-3', { id: 'cos-3', producerId: 'p-jose', product: 'Lechuga', unit: 'unidad', availableOn: '2026-11-07', unitPrice: 1300, estimated: 500, reserved: 0 }],
      ['cos-6', { id: 'cos-6', producerId: 'p-carmen', product: 'Tomate de árbol', unit: 'kg', availableOn: '2026-11-10', unitPrice: 3300, estimated: 350, reserved: 0 }],
    ]);
    this.failReleases = 0; // how many releases fail before working (catalog down)
    this.releases = [];
  }

  #get(id) {
    const harvest = this.harvests.get(id);
    if (!harvest) throw new NotFound('Cosecha');
    return harvest;
  }

  async reserve(id, quantity) {
    const harvest = this.#get(id);
    const free = harvest.estimated - harvest.reserved;
    if (quantity > free) throw new DomainError(`Solo quedan ${free} ${harvest.unit} libres`, 409);
    harvest.reserved += quantity;
    return { ...harvest };
  }

  async release(id, quantity) {
    if (this.failReleases > 0) {
      this.failReleases -= 1;
      throw new ServiceUnavailable('catalog', { details: 'connection refused' });
    }
    const harvest = this.#get(id);
    harvest.reserved = Math.max(0, harvest.reserved - quantity);
    this.releases.push([id, quantity]);
    return { ...harvest };
  }

  async getHarvestsByIds(ids) {
    return ids.map((id) => this.harvests.get(id)).filter(Boolean);
  }

  reservedOf(id) {
    return this.harvests.get(id).reserved;
  }
}

export class FakeCartClient {
  constructor() {
    this.carts = new Map();
    this.failEmpty = false;
  }

  async items(buyerId) {
    return [...(this.carts.get(buyerId) ?? [])];
  }

  async empty(buyerId) {
    if (this.failEmpty) throw new ServiceUnavailable('cart', { details: 'deadline exceeded' });
    this.carts.set(buyerId, []);
  }
}

const USERS = [
  { id: 'p-rosa', role: 'PRODUCER', name: 'Rosa Pérez' },
  { id: 'p-jose', role: 'PRODUCER', name: 'José Rincón' },
  { id: 'p-carmen', role: 'PRODUCER', name: 'Carmen Suárez' },
  { id: 'c-ana', role: 'BUYER', name: 'Ana Torres' },
  { id: 'c-tienda', role: 'BUYER', name: 'Tienda Don Pedro' },
];

export class FakeUserClient {
  async getUser(id) {
    const user = USERS.find((u) => u.id === id);
    if (!user) throw new NotFound('Usuario');
    return user;
  }

  async getUsersByIds(ids) {
    return USERS.filter((u) => ids.includes(u.id));
  }
}

export async function createTestContainer() {
  const catalog = new FakeCatalogClient();
  const cart = new FakeCartClient();
  const errors = [];
  const container = await createContainer({
    clients: { catalogClient: catalog, cartClient: cart, userClient: new FakeUserClient() },
    log: { error: (message) => errors.push(message) },
    retryDelayMs: 1,
  });
  return { ...container, catalog, cart, errors };
}
