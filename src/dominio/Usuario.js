import { Entidad } from './Entidad.js';
import { Coordenada } from './Coordenada.js';
import { ErrorDominio } from './errores.js';

/**
 * Usuario abstracto. Productor y Comprador heredan de aquí y redefinen
 * (polimorfismo) los criterios con los que la contraparte los califica:
 * así se implementa la reputación bidireccional.
 */
export class Usuario extends Entidad {
  constructor({ nombre, telefono = '', ubicacion, ...base }) {
    super(base);
    if (new.target === Usuario) throw new TypeError('Usuario es abstracta');
    if (!nombre?.trim()) throw new ErrorDominio('El nombre es obligatorio');
    this.nombre = nombre.trim();
    this.telefono = telefono;
    this.ubicacion = Coordenada.desde(ubicacion);
  }

  /** @returns {'PRODUCTOR'|'COMPRADOR'} */
  get rol() {
    throw new Error('Subclase debe implementar rol');
  }

  /** Criterios (1–5) con los que otros califican a este usuario. */
  criteriosDeCalificacion() {
    throw new Error('Subclase debe implementar criteriosDeCalificacion');
  }

  toJSON() {
    return {
      ...super.toJSON(),
      rol: this.rol,
      nombre: this.nombre,
      telefono: this.telefono,
      ubicacion: this.ubicacion,
    };
  }
}

export class Productor extends Usuario {
  constructor({ finca, vereda, municipio, cultivos = [], ...resto }) {
    super(resto);
    if (!vereda) throw new ErrorDominio('La vereda es obligatoria');
    this.finca = finca ?? `Finca de ${this.nombre}`;
    this.vereda = vereda;
    this.municipio = municipio;
    this.cultivos = cultivos;
  }

  get rol() {
    return 'PRODUCTOR';
  }

  criteriosDeCalificacion() {
    return ['calidad', 'cumplimiento'];
  }

  toJSON() {
    return {
      ...super.toJSON(),
      finca: this.finca,
      vereda: this.vereda,
      municipio: this.municipio,
      cultivos: this.cultivos,
    };
  }
}

export class Comprador extends Usuario {
  static TIPOS = ['CONSUMIDOR', 'TIENDA', 'RESTAURANTE'];

  constructor({ tipo = 'CONSUMIDOR', ...resto }) {
    super(resto);
    if (!Comprador.TIPOS.includes(tipo)) throw new ErrorDominio(`Tipo de comprador inválido: ${tipo}`);
    this.tipo = tipo;
  }

  get rol() {
    return 'COMPRADOR';
  }

  criteriosDeCalificacion() {
    return ['pagoATiempo', 'seriedad'];
  }

  toJSON() {
    return { ...super.toJSON(), tipo: this.tipo };
  }
}

/** Fábrica: reconstruye el subtipo correcto a partir de datos planos (repositorio / JSON). */
export function crearUsuario(datos) {
  switch (datos.rol) {
    case 'PRODUCTOR': return new Productor(datos);
    case 'COMPRADOR': return new Comprador(datos);
    default: throw new ErrorDominio(`Rol desconocido: ${datos.rol}`);
  }
}
