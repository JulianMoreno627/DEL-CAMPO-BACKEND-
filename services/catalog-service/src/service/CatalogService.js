import { Coordinate } from '../model/Coordinate.js';
import { HarvestStatus } from '../model/Harvest.js';

/**
 * Read queries: seasonal catalog, proximity and producer profile.
 * The producers come from user-service, the prices from pricing-service and the reputation
 * from reputation-service, always over gRPC.
 */
export class CatalogService {
  constructor({ harvestRepo, userClient, pricingClient, reputationClient }) {
    this.harvestRepo = harvestRepo;
    this.userClient = userClient;
    this.pricingClient = pricingClient;
    this.reputationClient = reputationClient;
  }

  /**
   * @param {object} filter
   * @param {number} [filter.lat] @param {number} [filter.lng] buyer's location
   * @param {number} [filter.radiusKm]
   * @param {string} [filter.category] @param {string} [filter.status]
   * @param {number} [filter.maxDays] only harvests available within N days
   * @returns {Promise<{harvest, producer, distanceKm, price}[]>}
   */
  async catalog({ lat, lng, radiusKm, category, status, maxDays } = {}) {
    const origin = lat != null && lng != null ? new Coordinate(lat, lng) : null;
    const dateLimit = maxDays != null ? new Date(Date.now() + Number(maxDays) * 86_400_000) : null;

    const harvests = await this.harvestRepo.list((h) =>
      h.status !== HarvestStatus.SOLD_OUT &&
      (!category || h.category === category) &&
      (!status || h.status === status) &&
      (!dateLimit || new Date(h.availableOn) <= dateLimit));

    const [producerList, prices] = await Promise.all([
      this.userClient.listProducers(),
      this.pricingClient.evaluate(harvests.map((h) => ({ product: h.product, price: h.unitPrice }))),
    ]);
    const producers = new Map(producerList.map((p) => [p.id, p]));

    const items = harvests.map((harvest, i) => {
      const p = producers.get(harvest.producerId);
      const location = p?.location ? Coordinate.from(p.location) : null;
      return {
        harvest,
        producer: p && { id: p.id, name: p.name, farm: p.farm, village: p.village, town: p.town, location },
        distanceKm: origin && location ? Number(location.distanceKm(origin).toFixed(1)) : null,
        price: { evaluation: prices[i].evaluation, reference: prices[i].reference ?? null },
      };
    });

    const filtered = origin && radiusKm ? items.filter((i) => i.distanceKm != null && i.distanceKm <= Number(radiusKm)) : items;
    // Harvests whose producer has no known location go last
    return filtered.sort((a, b) =>
      origin ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : a.harvest.availableOn.localeCompare(b.harvest.availableOn));
  }

  /** Harvest calendar grouped by availability month (used by the SSG page). */
  async season() {
    const items = await this.catalog();
    const months = new Map();
    for (const item of items.sort((a, b) => a.harvest.availableOn.localeCompare(b.harvest.availableOn))) {
      const month = item.harvest.availableOn.slice(0, 7);
      if (!months.has(month)) months.set(month, []);
      months.get(month).push(item);
    }
    return [...months].map(([month, harvests]) => ({ month, harvests }));
  }

  async producerProfile(id) {
    const producer = await this.userClient.getUser(id);
    const harvests = await this.harvestRepo.list((h) => h.producerId === id);
    const [prices, reputation] = await Promise.all([
      this.pricingClient.evaluate(harvests.map((h) => ({ product: h.product, price: h.unitPrice }))),
      this.reputationClient.getReputation(id),
    ]);
    return {
      producer,
      harvests: harvests.map((harvest, i) => ({ harvest, priceEvaluation: prices[i].evaluation })),
      reputation,
    };
  }

  /** Missing ids are skipped: used by cart-service and order-service to enrich their data. */
  async harvestsByIds(ids) {
    const wanted = new Set(ids);
    return this.harvestRepo.list((h) => wanted.has(h.id));
  }
}
