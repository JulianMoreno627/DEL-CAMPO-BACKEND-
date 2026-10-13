import { RepositorioMemoria } from './Repositorio.js';
import { crearUsuario } from '../dominio/Usuario.js';

export class RepositorioUsuarios extends RepositorioMemoria {
  constructor() {
    super('Usuario', crearUsuario);
  }

  /**
   * Productores dentro de un radio. Equivalente en PostGIS:
   *   SELECT * FROM usuario
   *   WHERE rol = 'PRODUCTOR'
   *     AND ST_DWithin(ubicacion, ST_MakePoint($lng, $lat)::geography, $radioKm * 1000)
   *   ORDER BY ubicacion <-> ST_MakePoint($lng, $lat)::geography;
   */
  async productoresCercanos(origen, radioKm) {
    const productores = await this.listar((u) => u.rol === 'PRODUCTOR');
    return productores
      .map((p) => ({ productor: p, distanciaKm: p.ubicacion.distanciaKm(origen) }))
      .filter((x) => x.distanciaKm <= radioKm)
      .sort((a, b) => a.distanciaKm - b.distanciaKm);
  }
}
