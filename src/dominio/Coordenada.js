import { ErrorDominio } from './errores.js';

/**
 * Objeto de valor (inmutable) para la ubicación de una finca o punto de entrega.
 * En producción el cálculo de cercanía lo hace PostGIS (ST_DWithin / ST_Distance);
 * aquí se usa la fórmula de Haversine para el repositorio en memoria.
 */
export class Coordenada {
  static RADIO_TIERRA_KM = 6371;

  constructor(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new ErrorDominio('Latitud inválida');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new ErrorDominio('Longitud inválida');
    this.lat = lat;
    this.lng = lng;
    Object.freeze(this);
  }

  static desde(valor) {
    return valor instanceof Coordenada ? valor : new Coordenada(valor.lat, valor.lng);
  }

  distanciaKm(otra) {
    const rad = (g) => (g * Math.PI) / 180;
    const dLat = rad(otra.lat - this.lat);
    const dLng = rad(otra.lng - this.lng);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(this.lat)) * Math.cos(rad(otra.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * Coordenada.RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
  }

  toJSON() {
    return { lat: this.lat, lng: this.lng };
  }
}
