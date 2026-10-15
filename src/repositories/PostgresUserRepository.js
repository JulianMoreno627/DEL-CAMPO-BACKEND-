import { PostgresRepository } from './PostgresRepository.js';
import { Coordinate } from '../domain/Coordinate.js';
import { createUser } from '../domain/User.js';

/**
 * User repository backed by Postgres.
 * - location is stored as two DOUBLE PRECISION columns (lat, lng) and rebuilt as a Coordinate.
 * - nearbyProducers uses the Haversine formula in JS (no PostGIS needed).
 */
export class PostgresUserRepository extends PostgresRepository {
  constructor({ pool }) {
    super({
      pool,
      table: 'app_user',
      resourceName: 'Usuario',
      factory: createUser,
      columnMap: {
        type: 'buyer_type',
      },
    });
  }

  fromRow(row) {
    const data = {
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
    };
    if (row.lat != null && row.lng != null) {
      data.location = new Coordinate(row.lat, row.lng);
    }
    return this.factory(data);
  }

  toRow(entity) {
    const obj = entity.toJSON();
    const location = obj.location;
    const columns = [
      'id', 'role', 'name', 'phone', 'lat', 'lng',
      'farm', 'village', 'town', 'crops', 'buyer_type', 'version', 'updated_at',
    ];
    const values = [
      obj.id, obj.role, obj.name, obj.phone,
      location ? location.lat : null,
      location ? location.lng : null,
      obj.farm ?? null, obj.village ?? null, obj.town ?? null,
      obj.crops ?? [],
      obj.type ?? null,
      obj.version, obj.updatedAt,
    ];
    return { columns, values };
  }

  /** Producers within a radius (Haversine in JS; no PostGIS extension needed). */
  async nearbyProducers(origin, radiusKm) {
    const producers = await this.list((user) => user.role === 'PRODUCER' && user.location);
    return producers
      .map((producer) => ({ producer, distanceKm: producer.location.distanceKm(origin) }))
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }
}
