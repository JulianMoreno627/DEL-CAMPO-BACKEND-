import { Calificacion, Reputacion } from '../dominio/Reputacion.js';
import { ErrorDominio } from '../dominio/errores.js';

/** Reputación bidireccional: compradores califican productores y viceversa. */
export class ReputacionService {
  constructor({ repoCalificaciones, repoReservas, repoUsuarios }) {
    this.repoCalificaciones = repoCalificaciones;
    this.repoReservas = repoReservas;
    this.repoUsuarios = repoUsuarios;
  }

  async calificar({ reservaId, deUsuarioId, puntajes, comentario }) {
    const reserva = await this.repoReservas.obtenerOFallar(reservaId);
    // Solo se califica una transacción real y terminada: evita reseñas falsas entre desconocidos.
    if (!reserva.finalizada) throw new ErrorDominio('Solo se califica una reserva entregada', 409);

    let aUsuarioId;
    if (deUsuarioId === reserva.compradorId) aUsuarioId = reserva.productorId;
    else if (deUsuarioId === reserva.productorId) aUsuarioId = reserva.compradorId;
    else throw new ErrorDominio('No participó en esta reserva', 403);

    const yaCalifico = await this.repoCalificaciones.listar((c) => c.reservaId === reservaId && c.deUsuarioId === deUsuarioId);
    if (yaCalifico.length) throw new ErrorDominio('Ya calificó esta reserva', 409);

    // Polimorfismo: el calificado (Productor o Comprador) define sus propios criterios
    const calificado = await this.repoUsuarios.obtenerOFallar(aUsuarioId);
    const esperados = calificado.criteriosDeCalificacion();
    const recibidos = Object.keys(puntajes ?? {});
    if (esperados.length !== recibidos.length || !esperados.every((c) => recibidos.includes(c))) {
      throw new ErrorDominio(`Criterios esperados: ${esperados.join(', ')}`);
    }

    const calificacion = new Calificacion({ reservaId, deUsuarioId, aUsuarioId, puntajes, comentario });
    await this.repoCalificaciones.guardar(calificacion);
    return calificacion;
  }

  async reputacionDe(usuarioId) {
    const recibidas = await this.repoCalificaciones.listar((c) => c.aUsuarioId === usuarioId);
    return {
      ...new Reputacion(recibidas).toJSON(),
      recientes: recibidas
        .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
        .slice(0, 5)
        .map((c) => ({ puntajes: c.puntajes, comentario: c.comentario, fecha: c.actualizadoEn })),
    };
  }
}
