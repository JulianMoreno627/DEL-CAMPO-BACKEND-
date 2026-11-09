/**
 * Results of the offline operations already processed (idempotency by opId).
 * Before the migration they were all loaded in memory at startup; now each one is looked up when needed.
 */
export class InMemorySyncOperationRepository {
  #rows = new Map();

  async get(opId) {
    return this.#rows.get(opId) ?? null;
  }

  async save(opId, result) {
    if (!this.#rows.has(opId)) this.#rows.set(opId, structuredClone(result));
  }
}

/** Table sync_operation (owned by catalog-service). */
export class PostgresSyncOperationRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async get(opId) {
    const { rows } = await this.pool.query('SELECT result FROM sync_operation WHERE op_id = $1', [opId]);
    return rows[0]?.result ?? null;
  }

  async save(opId, result) {
    await this.pool.query(
      'INSERT INTO sync_operation (op_id, device_id, result) VALUES ($1, $2, $3) ON CONFLICT (op_id) DO NOTHING',
      [opId, result.deviceId ?? null, JSON.stringify(result)]);
  }
}
