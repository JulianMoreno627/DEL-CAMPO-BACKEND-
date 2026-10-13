import { InMemoryRepository } from './Repository.js';
import { createUser } from '../domain/User.js';

export class UserRepository extends InMemoryRepository {
  constructor() {
    super('Usuario', createUser);
  }

  /**
   * Producers within a radius. PostGIS equivalent:
   *   SELECT * FROM app_user
   *   WHERE role = 'PRODUCER'
   *     AND ST_DWithin(location, ST_MakePoint($lng, $lat)::geography, $radiusKm * 1000)
   *   ORDER BY location <-> ST_MakePoint($lng, $lat)::geography;
   */
  async nearbyProducers(origin, radiusKm) {
    const producers = await this.list((user) => user.role === 'PRODUCER' && user.location);
    return producers
      .map((producer) => ({ producer, distanceKm: producer.location.distanceKm(origin) }))
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }
}
