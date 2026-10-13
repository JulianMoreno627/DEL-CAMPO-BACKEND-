import { Entidad } from './Entidad.js';
import { ErrorDominio, TransicionInvalida } from './errores.js';

export const EstadoCosecha = Object.freeze({
  SEMBRADO: 'SEMBRADO',
  EN_CRECIMIENTO: 'EN_CRECIMIENTO',
  DISPONIBLE: 'DISPONIBLE',
  AGOTADO: 'AGOTADO',
});

/** Máquina de estados: sembrado → en crecimiento → disponible → agotado. */
const TRANSICIONES = Object.freeze({
  SEMBRADO: ['EN_CRECIMIENTO'],
  EN_CRECIMIENTO: ['DISPONIBLE'],
  DISPONIBLE: ['AGOTADO'],
  AGOTADO: [],
});

/** Campos que el productor puede editar (también desde el modo offline). */
const CAMPOS_EDITABLES = ['cantidadEstimada', 'precioUnitario', 'fechaDisponible', 'descripcion', 'foto', 'estado'];

/**
 * Una cosecha NO es un stock fijo: es una producción futura con fecha estimada,
 * que admite reservas anticipadas mientras no esté agotada.
 */
export class Cosecha extends Entidad {
  #estado;

  constructor({
    productorId, producto, categoria = 'otros', unidad = 'kg',
    cantidadEstimada, cantidadReservada = 0, precioUnitario,
    fechaSiembra = null, fechaDisponible, descripcion = '', foto = null,
    estado = EstadoCosecha.SEMBRADO, marcasCampo = {}, ...base
  }) {
    super(base);
    if (!productorId) throw new ErrorDominio('La cosecha debe pertenecer a un productor');
    if (!producto?.trim()) throw new ErrorDominio('El producto es obligatorio');
    if (!EstadoCosecha[estado]) throw new ErrorDominio(`Estado inválido: ${estado}`);
    this.productorId = productorId;
    this.producto = producto.trim();
    this.categoria = categoria;
    this.unidad = unidad;
    this.cantidadReservada = Number(cantidadReservada);
    this.#asignarCantidadEstimada(cantidadEstimada);
    this.#asignarPrecio(precioUnitario);
    this.#asignarFechaDisponible(fechaDisponible);
    this.fechaSiembra = fechaSiembra;
    this.descripcion = descripcion;
    this.foto = foto;
    this.#estado = estado;
    // Marca de tiempo de la última escritura de cada campo (resolución de conflictos LWW por campo)
    this.marcasCampo = { ...marcasCampo };
  }

  get estado() {
    return this.#estado;
  }

  get cantidadLibre() {
    return this.cantidadEstimada - this.cantidadReservada;
  }

  admiteReservas() {
    return this.#estado !== EstadoCosecha.AGOTADO && this.cantidadLibre > 0;
  }

  puedeAvanzarA(nuevoEstado) {
    return TRANSICIONES[this.#estado].includes(nuevoEstado);
  }

  avanzarA(nuevoEstado) {
    if (!this.puedeAvanzarA(nuevoEstado)) throw new TransicionInvalida(this.#estado, nuevoEstado);
    this.#estado = nuevoEstado;
    this.tocar();
  }

  /** Reserva anticipada de parte de la cosecha. */
  reservar(cantidad) {
    cantidad = Number(cantidad);
    if (!(cantidad > 0)) throw new ErrorDominio('La cantidad a reservar debe ser positiva');
    if (!this.admiteReservas()) throw new ErrorDominio('Esta cosecha ya no admite reservas', 409);
    if (cantidad > this.cantidadLibre) {
      throw new ErrorDominio(`Solo quedan ${this.cantidadLibre} ${this.unidad} libres`, 409);
    }
    this.cantidadReservada += cantidad;
    if (this.cantidadLibre === 0 && this.#estado === EstadoCosecha.DISPONIBLE) {
      this.#estado = EstadoCosecha.AGOTADO;
    }
    this.tocar();
  }

  /** Devuelve cantidad reservada (por ejemplo, al cancelar una reserva). */
  liberar(cantidad) {
    this.cantidadReservada = Math.max(0, this.cantidadReservada - Number(cantidad));
    this.tocar();
  }

  /**
   * Aplica cambios con resolución de conflictos "Last-Writer-Wins" por campo:
   * un campo solo se sobrescribe si el cambio es más reciente que la última
   * escritura registrada de ese campo. Es atómico: si un valor es inválido no se aplica nada.
   * @returns {{ aplicados: string[], conflictos: string[] }}
   */
  aplicarCambios(cambios, marcaTiempo = new Date().toISOString()) {
    const aplicados = [];
    const conflictos = [];
    const respaldo = this.#instantanea();
    try {
      // 'estado' se aplica al final para validar contra la cantidad ya actualizada
      const campos = Object.keys(cambios)
        .filter((c) => CAMPOS_EDITABLES.includes(c))
        .sort((a, b) => (a === 'estado') - (b === 'estado'));
      for (const campo of campos) {
        const ultima = this.marcasCampo[campo];
        if (ultima && ultima > marcaTiempo) {
          conflictos.push(campo);
          continue;
        }
        this.#asignar(campo, cambios[campo]);
        this.marcasCampo[campo] = marcaTiempo;
        aplicados.push(campo);
      }
    } catch (error) {
      this.#restaurar(respaldo);
      throw error;
    }
    if (aplicados.length) this.tocar();
    return { aplicados, conflictos };
  }

  #asignar(campo, valor) {
    switch (campo) {
      case 'cantidadEstimada': return this.#asignarCantidadEstimada(valor);
      case 'precioUnitario': return this.#asignarPrecio(valor);
      case 'fechaDisponible': return this.#asignarFechaDisponible(valor);
      case 'estado':
        if (valor === this.#estado) return;
        if (!this.puedeAvanzarA(valor)) throw new TransicionInvalida(this.#estado, valor);
        this.#estado = valor;
        return;
      default:
        this[campo] = valor;
    }
  }

  #asignarCantidadEstimada(valor) {
    const cantidad = Number(valor);
    if (!(cantidad > 0)) throw new ErrorDominio('La cantidad estimada debe ser positiva');
    if (cantidad < this.cantidadReservada) {
      throw new ErrorDominio(`Ya hay ${this.cantidadReservada} ${this.unidad ?? ''} reservados; no puede estimar menos`, 409);
    }
    this.cantidadEstimada = cantidad;
  }

  #asignarPrecio(valor) {
    const precio = Number(valor);
    if (!(precio > 0)) throw new ErrorDominio('El precio debe ser positivo');
    this.precioUnitario = precio;
  }

  #asignarFechaDisponible(valor) {
    if (!valor || Number.isNaN(Date.parse(valor))) throw new ErrorDominio('Fecha de disponibilidad inválida');
    this.fechaDisponible = String(valor).slice(0, 10);
  }

  #instantanea() {
    return { ...this.toJSON(), marcasCampo: { ...this.marcasCampo } };
  }

  #restaurar(copia) {
    for (const campo of CAMPOS_EDITABLES) {
      if (campo === 'estado') this.#estado = copia.estado;
      else this[campo] = copia[campo];
    }
    this.marcasCampo = copia.marcasCampo;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      productorId: this.productorId,
      producto: this.producto,
      categoria: this.categoria,
      unidad: this.unidad,
      cantidadEstimada: this.cantidadEstimada,
      cantidadReservada: this.cantidadReservada,
      cantidadLibre: this.cantidadLibre,
      precioUnitario: this.precioUnitario,
      fechaSiembra: this.fechaSiembra,
      fechaDisponible: this.fechaDisponible,
      descripcion: this.descripcion,
      foto: this.foto,
      estado: this.#estado,
      marcasCampo: this.marcasCampo,
    };
  }
}
