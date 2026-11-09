import { unary, currentContext } from '@del-campo/shared';
import {
  publishFromMessage, editFromMessage, harvestDataFromMessage, changesFromMessage,
  catalogFilterFromMessage, photoFromMessage, syncBatchFromMessage,
} from './dto/catalogDto.js';

/** The acting user, propagated by the gateway in the metadata (x-user-id). */
const actor = () => currentContext().userId;

/**
 * gRPC API of catalog-service: the ONLY file of the service that knows gRPC.
 * Registers delcampo.catalog.CatalogService (proto/catalog.proto), converts messages ↔ DTOs
 * and delegates to the controller.
 *
 * @param {import('@del-campo/shared').GrpcServer} server
 * @param {import('./controller/CatalogController.js').CatalogController} controller
 */
export function registerCatalogGrpcApi(server, controller) {
  server.addService('catalog', {
    // ---- Listings
    listListings: unary(async ({ search }) => ({ listings: await controller.listListings(search) })),
    getListing: unary(({ id }) => controller.getListing(id)),
    listMyListings: unary(async () => ({ listings: await controller.listMyListings(actor()) })),
    publishListing: unary((message) => controller.publishListing(actor(), publishFromMessage(message))),
    editListing: unary((message) => controller.editListing(message.id, actor(), editFromMessage(message))),
    deleteListing: unary(async ({ id }) => { await controller.deleteListing(id, actor()); return {}; }),
    uploadListingPhoto: unary((message) => controller.uploadListingPhoto(message.id, actor(), photoFromMessage(message))),

    // ---- Harvests
    createHarvest: unary((message) => controller.createHarvest(actor(), harvestDataFromMessage(message))),
    updateHarvest: unary(({ id, changes, timestamp }) =>
      controller.updateHarvest(id, actor(), changesFromMessage(changes), timestamp)),
    uploadHarvestPhoto: unary((message) => controller.uploadHarvestPhoto(message.id, actor(), photoFromMessage(message))),

    // ---- Read queries
    getCatalog: unary(async (message) => ({ items: await controller.getCatalog(catalogFilterFromMessage(message)) })),
    getSeason: unary(async () => ({ months: await controller.getSeason() })),
    getProducerProfile: unary(({ producerId }) => controller.getProducerProfile(producerId)),
    getHarvestsByIds: unary(async ({ ids }) => ({ harvests: await controller.getHarvestsByIds(ids) })),

    // ---- Reservations (order-service)
    reserveHarvest: unary(({ harvestId, quantity }) => controller.reserveHarvest(harvestId, quantity)),
    releaseHarvest: unary(({ harvestId, quantity }) => controller.releaseHarvest(harvestId, quantity)),

    // ---- Offline synchronization
    applySyncBatch: unary((message) => controller.applySyncBatch(actor(), syncBatchFromMessage(message))),

    // ---- Server-side stream: every harvest change, while the subscriber stays connected
    watchHarvestChanges: (call) => {
      const unsubscribe = controller.subscribeToHarvestChanges((change) => call.write(change));
      call.on('cancelled', unsubscribe);
      call.on('close', unsubscribe);
    },
  });
}
