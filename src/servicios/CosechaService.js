import { Cosecha } from '../dominio/Cosecha.js';
import { ErrorDominio } from '../dominio/errores.js';
import { BusEventos } from './BusEventos.js';

export class CosechaService {
  constructor({ repoCosechas, repoUsuarios, bus }) {
    this.repoCosechas = repoCosechas;
    this.repoUsuarios = repoUsuarios;
    this.bus = bus;
  }

  async crear(datos) {
    const productor = await this.repoUsuarios.obtenerOFallar(datos.productorId);
    if (productor.rol !== 'PRODUCTOR') throw new ErrorDominio('Solo un productor puede publicar cosechas', 403);
    const { version: _v, cantidadReservada: _r, ...limpios } = datos; // el cliente no fija versión ni reservas
    const cosecha = new Cosecha(limpios);
    await this.repoCosechas.guardar(cosecha);
    this.bus.emit(BusEventos.COSECHA_CAMBIADA, cosecha);
    return cosecha;
  }

  /**
   * @param {string} id
   * @param {object} cambios
   * @param {object} opciones
   * @param {string} [opciones.marcaTiempo] momento en que el usuario hizo el cambio (puede ser offline)
   * @param {string} [opciones.productorId] quién edita (debe ser el dueño)
   */
  async actualizar(id, cambios, { marcaTiempo, productorId } = {}) {
    const cosecha = await this.repoCosechas.obtenerOFallar(id);
    if (productorId && cosecha.productorId !== productorId) throw new ErrorDominio('No es el dueño de esta cosecha', 403);
    const versionLeida = cosecha.version;
    const resultado = cosecha.aplicarCambios(cambios, normalizarMarca(marcaTiempo));
    if (resultado.aplicados.length) {
      await this.repoCosechas.guardar(cosecha, { versionEsperada: versionLeida });
      this.bus.emit(BusEventos.COSECHA_CAMBIADA, cosecha);
    }
    return { cosecha, ...resultado };
  }
}

/** Evita que un reloj adelantado en el celular "gane" siempre los conflictos. */
function normalizarMarca(marca) {
  const ahora = Date.now();
  const t = marca ? Date.parse(marca) : NaN;
  if (Number.isNaN(t) || t > ahora + 60_000) return new Date(ahora).toISOString();
  return new Date(t).toISOString();
}
