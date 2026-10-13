import { ErrorDominio } from '../dominio/errores.js';

/**
 * Recibe el lote de operaciones que el productor registró sin conexión (cola "outbox" en IndexedDB).
 * - Idempotente: cada operación trae un opId; si llega dos veces (reintento) se devuelve el mismo resultado.
 * - Conflictos: se resuelven campo por campo con Last-Writer-Wins (ver Cosecha.aplicarCambios).
 *   El resultado indica qué campos se aplicaron y cuáles perdieron frente a un cambio más reciente.
 */
export class SyncService {
  static MAX_OPERACIONES = 200;

  constructor({ cosechaService, repoCosechas }) {
    this.cosechaService = cosechaService;
    this.repoCosechas = repoCosechas;
    this.procesadas = new Map(); // opId -> resultado (en producción: tabla sync_operacion)
  }

  async aplicarLote({ dispositivoId, productorId, operaciones }) {
    if (!Array.isArray(operaciones)) throw new ErrorDominio('operaciones debe ser un arreglo');
    if (operaciones.length > SyncService.MAX_OPERACIONES) throw new ErrorDominio('Lote demasiado grande', 413);

    const ordenadas = [...operaciones].sort((a, b) => String(a.marcaTiempo).localeCompare(String(b.marcaTiempo)));
    const resultados = [];
    for (const op of ordenadas) {
      if (this.procesadas.has(op.opId)) {
        resultados.push({ ...this.procesadas.get(op.opId), repetida: true });
        continue;
      }
      const resultado = await this.#aplicar(op, productorId);
      resultado.dispositivoId = dispositivoId;
      this.procesadas.set(op.opId, resultado);
      resultados.push(resultado);
    }
    return { servidorEn: new Date().toISOString(), resultados };
  }

  async #aplicar(op, productorId) {
    const base = { opId: op.opId, tipo: op.tipo, entidadId: op.entidadId };
    try {
      switch (op.tipo) {
        case 'CREAR_COSECHA': {
          const existente = await this.repoCosechas.obtener(op.entidadId);
          const cosecha = existente ?? await this.cosechaService.crear({ ...op.datos, id: op.entidadId, productorId });
          return { ...base, estado: 'APLICADA', entidad: cosecha.toJSON() };
        }
        case 'ACTUALIZAR_COSECHA': {
          const { cosecha, aplicados, conflictos } = await this.cosechaService.actualizar(
            op.entidadId, op.datos, { marcaTiempo: op.marcaTiempo, productorId });
          const estado = conflictos.length === 0 ? 'APLICADA' : aplicados.length ? 'PARCIAL' : 'RECHAZADA';
          return { ...base, estado, aplicados, conflictos, entidad: cosecha.toJSON() };
        }
        default:
          throw new ErrorDominio(`Tipo de operación desconocido: ${op.tipo}`);
      }
    } catch (error) {
      if (!(error instanceof ErrorDominio)) throw error;
      const actual = op.entidadId ? await this.repoCosechas.obtener(op.entidadId) : null;
      return { ...base, estado: 'RECHAZADA', mensaje: error.message, entidad: actual?.toJSON() ?? null };
    }
  }
}
