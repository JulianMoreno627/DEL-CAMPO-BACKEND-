import { DomainError } from './errors.js';

/**
 * Immutable value object for the location of a farm or a delivery point.
 * In production the proximity calculation is done by PostGIS (ST_DWithin / ST_Distance);
 * here the Haversine formula is used for the in-memory repository.
 */
export class Coordinate {
  static EARTH_RADIUS_KM = 6371;

  constructor(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new DomainError('Latitud inválida');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new DomainError('Longitud inválida');
    this.lat = lat;
    this.lng = lng;
    Object.freeze(this);
  }

  static from(value) {
    return value instanceof Coordinate ? value : new Coordinate(value.lat, value.lng);
  }

  distanceKm(other) {
    const rad = (degrees) => (degrees * Math.PI) / 180;
    const dLat = rad(other.lat - this.lat);
    const dLng = rad(other.lng - this.lng);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(this.lat)) * Math.cos(rad(other.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * Coordinate.EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }

  toJSON() {
    return { lat: this.lat, lng: this.lng };
  }
}
