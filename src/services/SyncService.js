import { DomainError } from '../domain/errors.js';

/**
 * Receives the batch of operations the producer recorded while offline (an "outbox" queue on the device).
 * - Idempotent: every operation carries an opId; if it arrives twice (retry) the same result is returned.
 * - Conflicts: resolved field by field with Last-Writer-Wins (see Harvest.applyChanges).
 *   The result tells which fields were applied and which lost against a newer change.
 */
export class SyncService {
  static MAX_OPERATIONS = 200;

  constructor({ harvestService, harvestRepo, syncStore = null }) {
    this.harvestService = harvestService;
    this.harvestRepo = harvestRepo;
    this.processed = new Map(); // opId -> result (in production: sync_operation table)
    this.syncStore = syncStore; // optional { save(opId, result) }
  }

  async applyBatch({ deviceId, producerId, operations }) {
    if (!Array.isArray(operations)) throw new DomainError('operations debe ser un arreglo');
    if (operations.length > SyncService.MAX_OPERATIONS) throw new DomainError('Lote demasiado grande', 413);

    const sorted = [...operations].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const results = [];
    for (const op of sorted) {
      if (this.processed.has(op.opId)) {
        results.push({ ...this.processed.get(op.opId), repeated: true });
        continue;
      }
      const result = await this.#apply(op, producerId);
      result.deviceId = deviceId;
      this.processed.set(op.opId, result);
      this.syncStore?.save(op.opId, result).catch(() => {});
      results.push(result);
    }
    return { serverAt: new Date().toISOString(), results };
  }

  async #apply(op, producerId) {
    const base = { opId: op.opId, type: op.type, entityId: op.entityId };
    try {
      switch (op.type) {
        case 'CREATE_HARVEST': {
          const existing = await this.harvestRepo.get(op.entityId);
          const harvest = existing ?? await this.harvestService.create({ ...op.data, id: op.entityId, producerId });
          return { ...base, status: 'APPLIED', entity: harvest.toJSON() };
        }
        case 'UPDATE_HARVEST': {
          const { harvest, applied, conflicts } = await this.harvestService.update(
            op.entityId, op.data, { timestamp: op.timestamp, producerId });
          const status = conflicts.length === 0 ? 'APPLIED' : applied.length ? 'PARTIAL' : 'REJECTED';
          return { ...base, status, applied, conflicts, entity: harvest.toJSON() };
        }
        default:
          throw new DomainError(`Tipo de operación desconocido: ${op.type}`);
      }
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const current = op.entityId ? await this.harvestRepo.get(op.entityId) : null;
      return { ...base, status: 'REJECTED', message: error.message, entity: current?.toJSON() ?? null };
    }
  }
}
