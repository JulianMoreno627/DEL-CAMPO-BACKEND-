import { InMemoryRepository, PostgresRepository } from '@del-campo/shared';
import { createUser } from '../model/User.js';
import { Coordinate } from '../model/Coordinate.js';

/** Producers within a radius, closest first (Haversine in JS; no PostGIS needed). */
async function nearbyProducers(repo, origin, radiusKm) {
  const producers = await repo.list((user) => user.role === 'PRODUCER' && user.location);
  return producers
    .map((producer) => ({ producer, distanceKm: producer.location.distanceKm(origin) }))
    .filter((x) => x.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** In-memory users (development and tests). */
export class InMemoryUserRepository extends InMemoryRepository {
  constructor() {
    super('Usuario', createUser);
  }

  nearbyProducers(origin, radiusKm) {
    return nearbyProducers(this, origin, radiusKm);
  }
}

/**
 * Users in PostgreSQL (table app_user, owned by user-service).
 * The location is stored as two DOUBLE PRECISION columns (lat, lng) and rebuilt as a Coordinate.
 */
export class PostgresUserRepository extends PostgresRepository {
  constructor({ pool }) {
    super({ pool, table: 'app_user', resourceName: 'Usuario', factory: createUser, columnMap: { type: 'buyer_type' } });
  }

  fromRow(row) {
    return this.factory({
      id: row.id,
      version: row.version,
      updatedAt: row.updated_at,
      name: row.name,
      phone: row.phone,
      role: row.role,
      farm: row.farm,
      village: row.village,
      town: row.town,
      crops: row.crops ?? [],
      type: row.buyer_type,
      location: row.lat != null && row.lng != null ? new Coordinate(row.lat, row.lng) : null,
    });
  }

  toRow(entity) {
    const user = entity.toJSON();
    return {
      columns: ['id', 'role', 'name', 'phone', 'lat', 'lng', 'farm', 'village', 'town', 'crops', 'buyer_type', 'version', 'updated_at'],
      values: [
        user.id, user.role, user.name, user.phone,
        user.location?.lat ?? null, user.location?.lng ?? null,
        user.farm ?? null, user.village ?? null, user.town ?? null, user.crops ?? [],
        user.type ?? null, user.version, user.updatedAt,
      ],
    };
  }

  nearbyProducers(origin, radiusKm) {
    return nearbyProducers(this, origin, radiusKm);
  }
}
