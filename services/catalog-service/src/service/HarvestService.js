import { DomainError } from '@del-campo/shared';
import { Harvest } from '../model/Harvest.js';
import { EventBus } from '../model/EventBus.js';
import { PhotoStorage } from '../repository/PhotoStorage.js';

/** Harvests: creation, edition (with offline conflict resolution), photos and reservations. */
export class HarvestService {
  /**
   * @param {object} deps
   * @param {import('@del-campo/shared').Repository} deps.harvestRepo
   * @param {import('../clients/UserClient.js').UserClient} deps.userClient
   * @param {PhotoStorage} deps.photoStorage
   * @param {EventBus} deps.bus
   */
  constructor({ harvestRepo, userClient, photoStorage, bus }) {
    this.harvestRepo = harvestRepo;
    this.userClient = userClient;
    this.photoStorage = photoStorage;
    this.bus = bus;
  }

  async create(data) {
    const producer = await this.userClient.getUser(data.producerId);
    if (producer.role !== 'PRODUCER') throw new DomainError('Solo un productor puede publicar cosechas', 403);
    const { version: _version, reservedQuantity: _reserved, ...clean } = data; // the client sets neither version nor reservations
    const harvest = new Harvest(clean);
    await this.harvestRepo.save(harvest);
    this.#changed(harvest);
    return harvest;
  }

  /**
   * @param {string} id
   * @param {object} changes
   * @param {object} options
   * @param {string} [options.timestamp] when the user made the change (may have been offline)
   * @param {string} [options.producerId] who edits (must be the owner)
   */
  async update(id, changes, { timestamp, producerId } = {}) {
    const harvest = await this.harvestRepo.getOrFail(id);
    if (producerId && harvest.producerId !== producerId) throw new DomainError('No es el dueño de esta cosecha', 403);
    const readVersion = harvest.version;
    const result = harvest.applyChanges(changes, normalizeTimestamp(timestamp));
    if (result.applied.length) {
      await this.harvestRepo.save(harvest, { expectedVersion: readVersion });
      this.#changed(harvest);
    }
    return { harvest, ...result };
  }

  /** Saves the photo and links it. The owner is checked BEFORE writing the file (no orphan photos). */
  async uploadPhoto(id, producerId, photo) {
    PhotoStorage.validate(photo);
    const harvest = await this.harvestRepo.getOrFail(id);
    if (harvest.producerId !== producerId) throw new DomainError('No es el dueño de esta cosecha', 403);
    const url = await this.photoStorage.save(photo);
    return (await this.update(id, { photo: url }, { producerId })).harvest;
  }

  /**
   * Advance reservation (step of the checkout saga and of a direct order).
   * If another buyer reserved between the read and the write, the repository throws VersionConflict (409).
   */
  async reserve(id, quantity) {
    const harvest = await this.harvestRepo.getOrFail(id);
    const readVersion = harvest.version;
    harvest.reserve(quantity);
    await this.harvestRepo.save(harvest, { expectedVersion: readVersion });
    this.#changed(harvest);
    return harvest;
  }

  /** Gives quantity back: a cancelled order or the compensation of the checkout saga. */
  async release(id, quantity) {
    const harvest = await this.harvestRepo.getOrFail(id);
    harvest.release(quantity);
    await this.harvestRepo.save(harvest);
    this.#changed(harvest);
    return harvest;
  }

  #changed(harvest) {
    this.bus.emit(EventBus.HARVEST_CHANGED, harvest);
  }
}

/** Prevents a phone with a clock set in the future from always "winning" conflicts. */
function normalizeTimestamp(timestamp) {
  const now = Date.now();
  const t = timestamp ? Date.parse(timestamp) : NaN;
  if (Number.isNaN(t) || t > now + 60_000) return new Date(now).toISOString();
  return new Date(t).toISOString();
}
