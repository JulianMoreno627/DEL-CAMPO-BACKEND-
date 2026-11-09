/**
 * DTOs of catalog-service and their mapping from / to proto/catalog.proto.
 * In the messages, an `optional` field that was not sent arrives as undefined; a message field
 * that was not set arrives as null. compact() removes the undefined fields so that a partial
 * change only touches what the client really sent.
 */

const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

// ---- Output (domain → message)

/** Accepts a Harvest or its JSON (the sync results are stored as JSON). */
export function toHarvestDto(harvest) {
  const h = typeof harvest.toJSON === 'function' ? harvest.toJSON() : harvest;
  return {
    id: h.id,
    version: h.version,
    updatedAt: h.updatedAt,
    producerId: h.producerId,
    product: h.product,
    category: h.category,
    unit: h.unit,
    estimatedQuantity: h.estimatedQuantity,
    reservedQuantity: h.reservedQuantity,
    freeQuantity: h.freeQuantity,
    unitPrice: h.unitPrice,
    plantedOn: h.plantedOn ?? undefined,
    availableOn: h.availableOn,
    description: h.description ?? '',
    photo: h.photo ?? undefined,
    status: h.status,
    fieldTimestamps: h.fieldTimestamps ?? {},
  };
}

export function toListingDto(listing) {
  return {
    id: listing.id,
    product: listing.product,
    description: listing.description ?? '',
    photo: listing.photo ?? undefined,
    price: listing.price,
    unit: listing.unit,
    availableQuantity: listing.availableQuantity,
    availableOn: listing.availableOn,
    publishedAt: listing.publishedAt,
    producer: listing.producer ? { id: listing.producer.id, name: listing.producer.name, town: listing.producer.town ?? '' } : null,
    status: listing.status,
    soldQuantity: listing.soldQuantity,
  };
}

export function toCatalogItemDto({ harvest, producer, distanceKm, price }) {
  return {
    harvest: toHarvestDto(harvest),
    producer: producer
      ? {
        id: producer.id,
        name: producer.name,
        farm: producer.farm ?? '',
        village: producer.village ?? '',
        town: producer.town ?? '',
        location: producer.location ? { lat: producer.location.lat, lng: producer.location.lng } : null,
      }
      : null,
    distanceKm: distanceKm ?? undefined,
    price: { evaluation: price.evaluation, reference: price.reference ?? null },
  };
}

export const toSeasonMonthDto = ({ month, harvests }) => ({ month, harvests: harvests.map(toCatalogItemDto) });

export function toProfileDto({ producer, harvests, reputation }) {
  return {
    producer,
    harvests: harvests.map(({ harvest, priceEvaluation }) => ({ harvest: toHarvestDto(harvest), priceEvaluation })),
    reputation,
  };
}

export const toHarvestUpdateDto = ({ harvest, applied, conflicts }) => ({ harvest: toHarvestDto(harvest), applied, conflicts });

export function toSyncResultDto(result) {
  return {
    opId: result.opId,
    type: result.type,
    entityId: result.entityId,
    status: result.status,
    applied: result.applied ? { values: result.applied } : null,
    conflicts: result.conflicts ? { values: result.conflicts } : null,
    entity: result.entity ? toHarvestDto(result.entity) : null,
    message: result.message,
    deviceId: result.deviceId,
    repeated: Boolean(result.repeated),
  };
}

// ---- Input (message → domain)

export const publishFromMessage = ({ product, description, price, quantity, unit, category, availableOn }) =>
  ({ product, description, price, quantity, unit, category, availableOn });

export const editFromMessage = ({ product, description, price, quantity, availableOn }) =>
  ({ product, description, price, quantity, availableOn });

export const harvestDataFromMessage = (data) => compact({
  id: data?.id,
  product: data?.product,
  category: data?.category,
  unit: data?.unit,
  estimatedQuantity: data?.estimatedQuantity,
  unitPrice: data?.unitPrice,
  plantedOn: data?.plantedOn,
  availableOn: data?.availableOn,
  description: data?.description,
  photo: data?.photo,
  status: data?.status,
});

export const changesFromMessage = (changes) => compact({
  product: changes?.product,
  estimatedQuantity: changes?.estimatedQuantity,
  unitPrice: changes?.unitPrice,
  availableOn: changes?.availableOn,
  description: changes?.description,
  photo: changes?.photo,
  status: changes?.status,
});

export const catalogFilterFromMessage = ({ lat, lng, radiusKm, category, status, maxDays }) =>
  ({ lat, lng, radiusKm, category, status, maxDays });

export const photoFromMessage = ({ content, contentType }) => ({ content, contentType });

export function syncBatchFromMessage({ deviceId, operations, operationsIsList }) {
  return {
    deviceId,
    operations: operationsIsList
      ? operations.map((op) => ({
        opId: op.opId,
        type: op.type,
        entityId: op.entityId,
        timestamp: op.timestamp,
        data: harvestDataFromMessage(op.data),
      }))
      : null,
  };
}
