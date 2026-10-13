import { ConflictoVersion, NoEncontrado } from '../dominio/errores.js';

/**
 * Patrón Repository: los servicios dependen de esta interfaz, no de la base de datos.
 * En el Avance 1 se usa RepositorioMemoria; en la siguiente entrega se agrega
 * RepositorioPostgres (PostgreSQL + PostGIS) sin tocar los servicios.
 */
export class Repositorio {
  async obtener(_id) { throw new Error('No implementado'); }
  async listar(_filtro) { throw new Error('No implementado'); }
  async guardar(_entidad, _opciones) { throw new Error('No implementado'); }
  async eliminar(_id) { throw new Error('No implementado'); }

  async obtenerOFallar(id) {
    const entidad = await this.obtener(id);
    if (!entidad) throw new NoEncontrado(this.nombreRecurso ?? 'Registro');
    return entidad;
  }
}

export class RepositorioMemoria extends Repositorio {
  /**
   * @param {string} nombreRecurso  nombre legible para los errores
   * @param {(datos:object) => object} fabrica  reconstruye la entidad desde datos planos
   */
  constructor(nombreRecurso, fabrica) {
    super();
    this.nombreRecurso = nombreRecurso;
    this.fabrica = fabrica;
    this.datos = new Map();
  }

  // Se guarda una copia serializada: así nadie modifica el "almacenamiento" por referencia,
  // igual que pasaría con una base de datos real.
  async obtener(id) {
    const fila = this.datos.get(id);
    return fila ? this.fabrica(structuredClone(fila)) : null;
  }

  async listar(filtro = () => true) {
    return [...this.datos.values()].map((fila) => this.fabrica(structuredClone(fila))).filter(filtro);
  }

  /**
   * Control de concurrencia optimista: si se pasa versionEsperada y no coincide
   * con la almacenada, se lanza ConflictoVersion.
   */
  async guardar(entidad, { versionEsperada } = {}) {
    const actual = this.datos.get(entidad.id);
    if (versionEsperada != null && actual && actual.version !== versionEsperada) {
      throw new ConflictoVersion(actual);
    }
    this.datos.set(entidad.id, JSON.parse(JSON.stringify(entidad)));
    return entidad;
  }

  async eliminar(id) {
    return this.datos.delete(id);
  }
}
