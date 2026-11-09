import { DomainError } from '@del-campo/shared';
import { catalogItemJson, seasonJson, nearbyJson, profileJson, referenceJson } from '../restMappers.js';

/** Query string → number, as the old API did (Number of whatever was sent; absent stays absent). */
const number = (value) => (value == null ? undefined : Number(value));

/** REST ↔ gRPC: seasonal catalog (catalog), nearby producers (user) and reference prices (pricing). */
export class CatalogController {
  /** @param {{catalog, user, pricing}} clients GrpcClient of each service */
  constructor({ catalog, user, pricing }) {
    this.catalog = catalog;
    this.user = user;
    this.pricing = pricing;
  }

  catalogItems = async (req, res) => {
    const { lat, lng, radiusKm, category, status, maxDays } = req.query;
    res.set('Cache-Control', 'no-cache'); // the browser revalidates with ETag → 304 with no body if unchanged
    const { items } = await this.catalog.call('GetCatalog', {
      lat: number(lat), lng: number(lng), radiusKm: number(radiusKm), maxDays: number(maxDays),
      category: category == null ? undefined : String(category),
      status: status == null ? undefined : String(status),
    });
    res.json(items.map(catalogItemJson));
  };

  season = async (_req, res) => {
    res.json(seasonJson(await this.catalog.call('GetSeason')));
  };

  nearbyProducers = async (req, res) => {
    const { lat, lng, radiusKm } = req.query;
    if (lat == null || lng == null) throw new DomainError('lat y lng son obligatorios');
    res.json(nearbyJson(await this.user.call('NearbyProducers', { lat: Number(lat), lng: Number(lng), radiusKm: number(radiusKm) })));
  };

  producer = async (req, res) => {
    res.json(profileJson(await this.catalog.call('GetProducerProfile', { producerId: req.params.id })));
  };

  price = async (req, res) => {
    res.json(referenceJson(await this.pricing.call('GetReference', { product: req.params.product })));
  };
}
