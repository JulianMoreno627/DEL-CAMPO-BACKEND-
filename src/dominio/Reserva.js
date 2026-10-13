import { Entidad } from './Entidad.js';
import { ErrorDominio, TransicionInvalida } from './errores.js';

export const EstadoReserva = Object.freeze({
  PENDIENTE: 'PENDIENTE',     // el comprador apartó parte de la cosecha
  CONFIRMADA: 'CONFIRMADA',   // el productor aceptó
  ENTREGADA: 'ENTREGADA',     // producto entregado y pagado
  CANCELADA: 'CANCELADA',
});

const TRANSICIONES = Object.freeze({
  PENDIENTE: ['CONFIRMADA', 'CANCELADA'],
  CONFIRMADA: ['ENTREGADA', 'CANCELADA'],
  ENTREGADA: [],
  CANCELADA: [],
});

/** Pedido por lote: reserva de una parte de una cosecha, con precio congelado al reservar. */
export class Reserva extends Entidad {
  constructor({ cosechaId, productorId, compradorId, cantidad, precioUnitario, estado = EstadoReserva.PENDIENTE, ...base }) {
    super(base);
    if (!cosechaId || !productorId || !compradorId) throw new ErrorDominio('Reserva incompleta');
    if (!(Number(cantidad) > 0)) throw new ErrorDominio('La cantidad debe ser positiva');
    this.cosechaId = cosechaId;
    this.productorId = productorId;
    this.compradorId = compradorId;
    this.cantidad = Number(cantidad);
    this.precioUnitario = Number(precioUnitario);
    this.estado = estado;
  }

  get total() {
    return this.cantidad * this.precioUnitario;
  }

  /** Solo las reservas cerradas habilitan la calificación mutua. */
  get finalizada() {
    return this.estado === EstadoReserva.ENTREGADA;
  }

  cambiarEstado(nuevo) {
    if (!TRANSICIONES[this.estado]?.includes(nuevo)) throw new TransicionInvalida(this.estado, nuevo);
    this.estado = nuevo;
    this.tocar();
  }

  toJSON() {
    return {
      ...super.toJSON(),
      cosechaId: this.cosechaId,
      productorId: this.productorId,
      compradorId: this.compradorId,
      cantidad: this.cantidad,
      precioUnitario: this.precioUnitario,
      total: this.total,
      estado: this.estado,
    };
  }
}
