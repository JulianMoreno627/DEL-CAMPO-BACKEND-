import { Coordinate } from '../domain/Coordinate.js';
import { HarvestStatus } from '../domain/Harvest.js';

/** Read queries: seasonal catalog, proximity and producer profile. */
export class CatalogService {
  constructor({ harvestRepo, userRepo, priceCalculator, reputationService }) {
    this.harvestRepo = harvestRepo;
    this.userRepo = userRepo;
    this.priceCalculator = priceCalculator;
    this.reputationService = reputationService;
  }

  /**
   * @param {object} filter
   * @param {number} [filter.lat] @param {number} [filter.lng] buyer's location
   * @param {number} [filter.radiusKm]
   * @param {string} [filter.category] @param {string} [filter.status]
   * @param {number} [filter.maxDays] only harvests available within N days
   */
  async catalog({ lat, lng, radiusKm, category, status, maxDays } = {}) {
    const origin = lat != null && lng != null ? new Coordinate(lat, lng) : null;
    const dateLimit = maxDays != null ? new Date(Date.now() + Number(maxDays) * 86_400_000) : null;

    const harvests = await this.harvestRepo.list((h) =>
      h.status !== HarvestStatus.SOLD_OUT &&
      (!category || h.category === category) &&
      (!status || h.status === status) &&
      (!dateLimit || new Date(h.availableOn) <= dateLimit));

    const producers = new Map((await this.userRepo.list((u) => u.role === 'PRODUCER')).map((p) => [p.id, p]));

    const items = harvests.map((h) => {
      const p = producers.get(h.producerId);
      return {
        ...h.toJSON(),
        producer: p && { id: p.id, name: p.name, farm: p.farm, village: p.village, town: p.town, location: p.location },
        distanceKm: origin && p?.location ? Number(p.location.distanceKm(origin).toFixed(1)) : null,
        price: {
          evaluation: this.priceCalculator.evaluate(h.product, h.unitPrice),
          reference: this.priceCalculator.reference(h.product),
        },
      };
    });

    const filtered = origin && radiusKm ? items.filter((i) => i.distanceKm != null && i.distanceKm <= Number(radiusKm)) : items;
    // Harvests whose producer has no known location go last
    return filtered.sort((a, b) =>
      origin ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : a.availableOn.localeCompare(b.availableOn));
  }

  /** Harvest calendar grouped by availability month (used by the SSG page). */
  async season() {
    const items = await this.catalog();
    const months = new Map();
    for (const item of items.sort((a, b) => a.availableOn.localeCompare(b.availableOn))) {
      const month = item.availableOn.slice(0, 7);
      if (!months.has(month)) months.set(month, []);
      months.get(month).push(item);
    }
    return [...months].map(([month, harvests]) => ({ month, harvests }));
  }

  async nearbyProducers({ lat, lng, radiusKm = 50 }) {
    const result = await this.userRepo.nearbyProducers(new Coordinate(lat, lng), Number(radiusKm));
    return result.map(({ producer, distanceKm }) => ({ ...producer.toJSON(), distanceKm: Number(distanceKm.toFixed(1)) }));
  }

  async producerProfile(id) {
    const producer = await this.userRepo.getOrFail(id);
    const harvests = await this.harvestRepo.list((h) => h.producerId === id);
    const reputation = await this.reputationService.reputationOf(id);
    return {
      producer: producer.toJSON(),
      harvests: harvests.map((h) => ({ ...h.toJSON(), priceEvaluation: this.priceCalculator.evaluate(h.product, h.unitPrice) })),
      reputation,
    };
  }
}
