import { randomUUID } from 'node:crypto';

/**
 * Clase base de todas las entidades persistentes.
 * Aporta identidad, versión (control de concurrencia optimista) y fecha de actualización.
 */
export class Entidad {
  constructor({ id = randomUUID(), version = 1, actualizadoEn = new Date().toISOString() } = {}) {
    if (new.target === Entidad) throw new TypeError('Entidad es abstracta');
    this.id = id;
    this.version = version;
    this.actualizadoEn = actualizadoEn;
  }

  /** Marca la entidad como modificada: sube la versión. */
  tocar() {
    this.version += 1;
    this.actualizadoEn = new Date().toISOString();
  }

  toJSON() {
    return { id: this.id, version: this.version, actualizadoEn: this.actualizadoEn };
  }
}
