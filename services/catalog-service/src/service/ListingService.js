import { DomainError } from '@del-campo/shared';
import { HarvestStatus } from '../model/Harvest.js';
import { EventBus } from '../model/EventBus.js';

/**
 * Listing: the simple way the producer publishes what they grow
 * (product, description, price, quantity and photo) and the buyer sees it.
 * Internally a listing is a Harvest, so it reuses its rules (quantities, offline sync, orders).
 * The buyer only sees the price set by the producer, with no market analysis.
 */
export class ListingService {
  /**
   * @param {object} deps
   * @param {import('@del-campo/shared').Repository} deps.harvestRepo
   * @param {import('./HarvestService.js').HarvestService} deps.harvestService
   * @param {import('../clients/UserClient.js').UserClient} deps.userClient
   * @param {import('../clients/OrderClient.js').OrderClient} deps.orderClient
   * @param {EventBus} deps.bus
   */
  constructor({ harvestRepo, harvestService, userClient, orderClient, bus }) {
    this.harvestRepo = harvestRepo;
    this.harvestService = harvestService;
    this.userClient = userClient;
    this.orderClient = orderClient;
    this.bus = bus;
  }

  /** Listings the buyer can see and buy, newest first. */
  async list({ search } = {}) {
    const text = String(search ?? '').trim().toLowerCase();
    const harvests = await this.harvestRepo.list((h) =>
      h.acceptsReservations() && (!text || h.product.toLowerCase().includes(text)));
    const producers = new Map((await this.userClient.listProducers()).map((p) => [p.id, p]));
    return harvests
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((h) => toListing(h, producers.get(h.producerId)));
  }

  async get(id) {
    const harvest = await this.harvestRepo.getOrFail(id);
    const [producer] = await this.userClient.getUsersByIds([harvest.producerId]);
    return toListing(harvest, producer);
  }

  /** The producer's listings (including sold-out ones and how much has been sold). */
  async byProducer(producerId) {
    const harvests = await this.harvestRepo.list((h) => h.producerId === producerId);
    return harvests
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((h) => ({ ...toListing(h), status: h.status, soldQuantity: h.reservedQuantity }));
  }

  async publish(producerId, { product, description = '', price, quantity, unit = 'kg', category, availableOn }) {
    const harvest = await this.harvestService.create({
      producerId, product, description, unit, category,
      unitPrice: price,
      estimatedQuantity: quantity,
      availableOn: availableOn ?? new Date().toISOString().slice(0, 10),
      status: HarvestStatus.AVAILABLE,
    });
    return this.get(harvest.id);
  }

  async edit(id, producerId, { product, description, price, quantity, availableOn }) {
    const changes = Object.fromEntries(Object.entries({
      product, description, availableOn, unitPrice: price, estimatedQuantity: quantity,
    }).filter(([, value]) => value !== undefined));
    await this.harvestService.update(id, changes, { producerId });
    return this.get(id);
  }

  async uploadPhoto(id, producerId, photo) {
    await this.harvestService.uploadPhoto(id, producerId, photo);
    return this.get(id);
  }

  /**
   * A listing can only be deleted while it has no orders; placed orders must be kept
   * (order-service is asked, because cancelled orders no longer reserve quantity but still exist).
   */
  async remove(id, producerId) {
    const harvest = await this.harvestRepo.getOrFail(id);
    if (harvest.producerId !== producerId) throw new DomainError('No es el dueño de este anuncio', 403);
    if (harvest.reservedQuantity > 0 || await this.orderClient.hasOrdersForHarvest(id)) {
      throw new DomainError('Este anuncio ya tiene pedidos y no se puede eliminar', 409);
    }
    await this.harvestRepo.delete(id);
    this.bus.emit(EventBus.HARVEST_CHANGED, harvest);
  }
}

function toListing(h, producer) {
  return {
    id: h.id,
    product: h.product,
    description: h.description,
    photo: h.photo,
    price: h.unitPrice,
    unit: h.unit,
    availableQuantity: h.freeQuantity,
    availableOn: h.availableOn,
    publishedAt: h.updatedAt,
    producer: producer && { id: producer.id, name: producer.name, town: producer.town },
  };
}
