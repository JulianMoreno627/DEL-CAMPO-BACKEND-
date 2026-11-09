import { InMemoryRepository, PostgresRepository } from '@del-campo/shared';
import { Harvest } from '../model/Harvest.js';

const factory = (data) => new Harvest(data);

/** Harvests in memory (development and tests). */
export class InMemoryHarvestRepository extends InMemoryRepository {
  constructor() {
    super('Cosecha', factory);
  }
}

/** Table harvest (owned by catalog-service). freeQuantity is computed, it is not stored. */
export class PostgresHarvestRepository extends PostgresRepository {
  constructor({ pool }) {
    super({ pool, table: 'harvest', resourceName: 'Cosecha', factory, exclude: ['freeQuantity'] });
  }
}
