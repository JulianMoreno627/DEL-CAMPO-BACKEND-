import { Harvest } from '../domain/Harvest.js';
import { DomainError } from '../domain/errors.js';
import { EventBus } from './EventBus.js';

export class HarvestService {
  constructor({ harvestRepo, userRepo, bus }) {
    this.harvestRepo = harvestRepo;
    this.userRepo = userRepo;
    this.bus = bus;
  }

  async create(data) {
    const producer = await this.userRepo.getOrFail(data.producerId);
    if (producer.role !== 'PRODUCER') throw new DomainError('Solo un productor puede publicar cosechas', 403);
    const { version: _version, reservedQuantity: _reserved, ...clean } = data; // the client sets neither version nor reservations
    const harvest = new Harvest(clean);
    await this.harvestRepo.save(harvest);
    this.bus.emit(EventBus.HARVEST_CHANGED, harvest);
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
      this.bus.emit(EventBus.HARVEST_CHANGED, harvest);
    }
    return { harvest, ...result };
  }
}

/** Prevents a phone with a clock set in the future from always "winning" conflicts. */
function normalizeTimestamp(timestamp) {
  const now = Date.now();
  const t = timestamp ? Date.parse(timestamp) : NaN;
  if (Number.isNaN(t) || t > now + 60_000) return new Date(now).toISOString();
  return new Date(t).toISOString();
}
