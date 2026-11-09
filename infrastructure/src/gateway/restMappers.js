/**
 * gRPC message → REST JSON. They rebuild EXACTLY the JSON the API returned before the migration,
 * so the frontend keeps working without changes: an `optional` field that was not set travels as
 * undefined and becomes null where the old API returned null; fields that the old API did not
 * have (e.g. acceptsReservations, ratingCriteria) are left out.
 */

const coordinate = (location) => (location ? { lat: location.lat, lng: location.lng } : null);
const plain = (map) => ({ ...(map ?? {}) });

export function userJson(u) {
  const base = {
    id: u.id,
    version: u.version,
    updatedAt: u.updatedAt,
    role: u.role,
    name: u.name,
    phone: u.phone,
    location: coordinate(u.location),
  };
  if (u.role === 'PRODUCER') return { ...base, farm: u.farm, village: u.village, town: u.town, crops: [...u.crops] };
  return { ...base, type: u.type };
}

export const sessionJson = ({ token, user }) => ({ token, user: userJson(user) });

export function harvestJson(h) {
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
    plantedOn: h.plantedOn ?? null,
    availableOn: h.availableOn,
    description: h.description,
    photo: h.photo ?? null,
    status: h.status,
    fieldTimestamps: plain(h.fieldTimestamps),
  };
}

export function listingJson(l) {
  return {
    id: l.id,
    product: l.product,
    description: l.description,
    photo: l.photo ?? null,
    price: l.price,
    unit: l.unit,
    availableQuantity: l.availableQuantity,
    availableOn: l.availableOn,
    publishedAt: l.publishedAt,
    producer: l.producer ? { id: l.producer.id, name: l.producer.name, town: l.producer.town } : undefined,
  };
}

/** The producer's own list: no producer, with status and sold quantity. */
export const myListingJson = (l) => ({ ...listingJson(l), producer: undefined, status: l.status, soldQuantity: l.soldQuantity });

export function referenceJson(r) {
  if (!r) return null;
  return {
    product: r.product,
    marketPrice: r.marketPrice,
    middlemanPrice: r.middlemanPrice,
    unit: r.unit,
    fairRange: { min: r.fairRange.min, max: r.fairRange.max },
  };
}

export function catalogItemJson({ harvest, producer, distanceKm, price }) {
  return {
    ...harvestJson(harvest),
    producer: producer
      ? { id: producer.id, name: producer.name, farm: producer.farm, village: producer.village, town: producer.town, location: coordinate(producer.location) }
      : undefined,
    distanceKm: distanceKm ?? null,
    price: { evaluation: price.evaluation, reference: referenceJson(price.reference) },
  };
}

export const seasonJson = ({ months }) => months.map(({ month, harvests }) => ({ month, harvests: harvests.map(catalogItemJson) }));

export function reputationJson(r) {
  return {
    total: r.total,
    score: r.score,
    level: r.level,
    byCriterion: plain(r.byCriterion),
    recent: r.recent.map(({ scores, comment, date }) => ({ scores: plain(scores), comment, date })),
  };
}

export function profileJson({ producer, harvests, reputation }) {
  return {
    producer: userJson(producer),
    harvests: harvests.map(({ harvest, priceEvaluation }) => ({ ...harvestJson(harvest), priceEvaluation })),
    reputation: reputationJson(reputation),
  };
}

export const nearbyJson = ({ producers }) => producers.map(({ producer, distanceKm }) => ({ ...userJson(producer), distanceKm }));

export function cartJson({ items, total }) {
  return {
    items: items.map((line) => (line.found
      ? {
        listingId: line.listingId,
        quantity: line.quantity,
        product: line.product,
        photo: line.photo ?? null,
        unit: line.unit,
        price: line.price,
        subtotal: line.subtotal,
        availableQuantity: line.availableQuantity,
        available: line.available,
      }
      : { listingId: line.listingId, quantity: line.quantity, product: null, available: false, subtotal: 0 })),
    total,
  };
}

export function orderJson(o) {
  return {
    id: o.id,
    version: o.version,
    updatedAt: o.updatedAt,
    harvestId: o.harvestId,
    producerId: o.producerId,
    buyerId: o.buyerId,
    quantity: o.quantity,
    unitPrice: o.unitPrice,
    total: o.total,
    status: o.status,
  };
}

export const orderDetailJson = ({ order, product, unit, availableOn, producerName, buyerName }) =>
  ({ ...orderJson(order), product, unit, availableOn, producerName, buyerName });

export const checkoutJson = ({ orders, total }) => ({ orders: orders.map(orderJson), total });

export function ratingJson(r) {
  return {
    id: r.id,
    version: r.version,
    updatedAt: r.updatedAt,
    orderId: r.orderId,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    scores: plain(r.scores),
    comment: r.comment,
  };
}

export const harvestUpdateJson = ({ harvest, applied, conflicts }) => ({ harvest: harvestJson(harvest), applied: [...applied], conflicts: [...conflicts] });

export function syncResultJson(r) {
  return {
    opId: r.opId,
    type: r.type,
    entityId: r.entityId,
    status: r.status,
    ...(r.applied && { applied: [...r.applied.values] }),
    ...(r.conflicts && { conflicts: [...r.conflicts.values] }),
    ...(r.message !== undefined && { message: r.message }),
    entity: r.entity ? harvestJson(r.entity) : null,
    deviceId: r.deviceId,
    ...(r.repeated && { repeated: true }),
  };
}

export const syncBatchJson = ({ serverAt, results }) => ({ serverAt, results: results.map(syncResultJson) });
