import { Reserva, EstadoReserva } from '../dominio/Reserva.js';
import { ErrorDominio } from '../dominio/errores.js';
import { BusEventos } from './BusEventos.js';

export class ReservaService {
  constructor({ repoReservas, repoCosechas, repoUsuarios, bus }) {
    this.repoReservas = repoReservas;
    this.repoCosechas = repoCosechas;
    this.repoUsuarios = repoUsuarios;
    this.bus = bus;
  }

  async crear({ cosechaId, compradorId, cantidad }) {
    const comprador = await this.repoUsuarios.obtenerOFallar(compradorId);
    if (comprador.rol !== 'COMPRADOR') throw new ErrorDominio('Solo un comprador puede reservar', 403);
    const cosecha = await this.repoCosechas.obtenerOFallar(cosechaId);
    const versionLeida = cosecha.version;

    cosecha.reservar(cantidad);
    // Si otro comprador reservó entre la lectura y la escritura, el repositorio lanza ConflictoVersion (409)
    await this.repoCosechas.guardar(cosecha, { versionEsperada: versionLeida });

    const reserva = new Reserva({
      cosechaId, compradorId, productorId: cosecha.productorId, cantidad, precioUnitario: cosecha.precioUnitario,
    });
    await this.repoReservas.guardar(reserva);
    this.bus.emit(BusEventos.COSECHA_CAMBIADA, cosecha);
    this.bus.emit(BusEventos.RESERVA_CAMBIADA, reserva);
    return reserva;
  }

  /** Lista enriquecida con producto y nombres, para que el cliente no haga N peticiones extra. */
  async listar({ compradorId, productorId } = {}) {
    const reservas = await this.repoReservas.listar((r) =>
      (!compradorId || r.compradorId === compradorId) && (!productorId || r.productorId === productorId));
    const nombres = new Map((await this.repoUsuarios.listar()).map((u) => [u.id, u.nombre]));
    const cosechas = new Map((await this.repoCosechas.listar()).map((c) => [c.id, c]));
    return reservas
      .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
      .map((r) => ({
        ...r.toJSON(),
        producto: cosechas.get(r.cosechaId)?.producto,
        unidad: cosechas.get(r.cosechaId)?.unidad,
        fechaDisponible: cosechas.get(r.cosechaId)?.fechaDisponible,
        productorNombre: nombres.get(r.productorId),
        compradorNombre: nombres.get(r.compradorId),
      }));
  }

  /** Reglas: el productor confirma y entrega; cualquiera de los dos puede cancelar. */
  async cambiarEstado(id, nuevoEstado, usuarioId) {
    const reserva = await this.repoReservas.obtenerOFallar(id);
    const esProductor = usuarioId === reserva.productorId;
    const esComprador = usuarioId === reserva.compradorId;
    if (!esProductor && !esComprador) throw new ErrorDominio('No participa en esta reserva', 403);
    if ([EstadoReserva.CONFIRMADA, EstadoReserva.ENTREGADA].includes(nuevoEstado) && !esProductor) {
      throw new ErrorDominio('Solo el productor puede confirmar o entregar', 403);
    }

    reserva.cambiarEstado(nuevoEstado);
    if (nuevoEstado === EstadoReserva.CANCELADA) {
      const cosecha = await this.repoCosechas.obtenerOFallar(reserva.cosechaId);
      cosecha.liberar(reserva.cantidad);
      await this.repoCosechas.guardar(cosecha);
      this.bus.emit(BusEventos.COSECHA_CAMBIADA, cosecha);
    }
    await this.repoReservas.guardar(reserva);
    this.bus.emit(BusEventos.RESERVA_CAMBIADA, reserva);
    return reserva;
  }
}
