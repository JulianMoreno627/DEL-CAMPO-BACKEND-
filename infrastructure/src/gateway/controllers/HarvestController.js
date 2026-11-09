import { harvestJson, harvestUpdateJson, syncBatchJson } from '../restMappers.js';
import { photoUpload } from './photoUpload.js';

/** Fields of a harvest the client can send (HarvestData / HarvestChanges messages). */
const harvestData = (body = {}) => {
  const { id, product, category, unit, estimatedQuantity, unitPrice, plantedOn, availableOn, description, photo, status } = body ?? {};
  return { id, product, category, unit, estimatedQuantity, unitPrice, plantedOn, availableOn, description, photo, status };
};

/** REST ↔ gRPC (catalog-service): harvests and offline synchronization. */
export class HarvestController {
  /** @param {{catalog: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ catalog }) {
    this.catalog = catalog;
  }

  create = async (req, res) => {
    res.status(201).json(harvestJson(await this.catalog.call('CreateHarvest', harvestData(req.body))));
  };

  update = async (req, res) => {
    const { id: _id, ...changes } = harvestData(req.body);
    res.json(harvestUpdateJson(await this.catalog.call('UpdateHarvest', { id: req.params.id, changes })));
  };

  uploadPhoto = async (req, res) => {
    res.status(201).json(harvestJson(await this.catalog.call('UploadHarvestPhoto', photoUpload(req))));
  };

  sync = async (req, res) => {
    const { operations } = req.body ?? {};
    const isList = Array.isArray(operations);
    const result = await this.catalog.call('ApplySyncBatch', {
      deviceId: req.get('X-Device-Id') ?? 'unknown',
      operationsIsList: isList,
      operations: isList
        ? operations.map((op) => ({ opId: op?.opId, type: op?.type, entityId: op?.entityId, timestamp: op?.timestamp, data: harvestData(op?.data) }))
        : [],
    });
    res.json(syncBatchJson(result));
  };
}
