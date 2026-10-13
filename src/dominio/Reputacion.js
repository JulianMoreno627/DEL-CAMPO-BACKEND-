import { Entidad } from './Entidad.js';
import { ErrorDominio } from './errores.js';

/** Calificación que un participante de una reserva le da al otro. */
export class Calificacion extends Entidad {
  constructor({ reservaId, deUsuarioId, aUsuarioId, puntajes, comentario = '', ...base }) {
    super(base);
    if (!reservaId || !deUsuarioId || !aUsuarioId) throw new ErrorDominio('Calificación incompleta');
    if (deUsuarioId === aUsuarioId) throw new ErrorDominio('No puede calificarse a sí mismo');
    for (const [criterio, valor] of Object.entries(puntajes ?? {})) {
      if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
        throw new ErrorDominio(`Puntaje de "${criterio}" debe ser un entero de 1 a 5`);
      }
    }
    this.reservaId = reservaId;
    this.deUsuarioId = deUsuarioId;
    this.aUsuarioId = aUsuarioId;
    this.puntajes = puntajes;
    this.comentario = comentario;
  }

  get promedio() {
    const valores = Object.values(this.puntajes);
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      reservaId: this.reservaId,
      deUsuarioId: this.deUsuarioId,
      aUsuarioId: this.aUsuarioId,
      puntajes: this.puntajes,
      comentario: this.comentario,
    };
  }
}

/**
 * Objeto de valor que resume la reputación de un usuario.
 * Usa un promedio bayesiano: con pocas calificaciones la nota se acerca a la media
 * global (3.5), lo que evita que un usuario nuevo con una sola nota 5 (o 1) quede en los extremos.
 */
export class Reputacion {
  static MEDIA_PREVIA = 3.5;
  static PESO_PREVIO = 3;

  constructor(calificaciones = []) {
    this.total = calificaciones.length;
    this.porCriterio = {};
    const sumas = {};
    for (const c of calificaciones) {
      for (const [criterio, valor] of Object.entries(c.puntajes)) {
        sumas[criterio] ??= { suma: 0, n: 0 };
        sumas[criterio].suma += valor;
        sumas[criterio].n += 1;
      }
    }
    for (const [criterio, { suma, n }] of Object.entries(sumas)) {
      this.porCriterio[criterio] = Number((suma / n).toFixed(2));
    }
    const sumaPromedios = calificaciones.reduce((a, c) => a + c.promedio, 0);
    this.puntaje = Number(
      ((Reputacion.MEDIA_PREVIA * Reputacion.PESO_PREVIO + sumaPromedios) / (Reputacion.PESO_PREVIO + this.total)).toFixed(2),
    );
  }

  get nivel() {
    if (this.total < 3) return 'NUEVO';
    if (this.puntaje >= 4.3) return 'CONFIABLE';
    if (this.puntaje >= 3) return 'REGULAR';
    return 'EN_RIESGO';
  }

  toJSON() {
    return { total: this.total, puntaje: this.puntaje, nivel: this.nivel, porCriterio: this.porCriterio };
  }
}
