import { EventBus } from '../model/EventBus.js';
import {
  toHarvestDto, toListingDto, toCatalogItemDto, toSeasonMonthDto, toProfileDto, toHarvestUpdateDto, toSyncResultDto,
} from '../dto/catalogDto.js';

/**
 * Receives DTOs (and who is acting), calls the services and returns DTOs. No gRPC details:
 * the acting user is passed explicitly by the API layer.
 */
export class CatalogController {
  constructor({ listingService, harvestService, catalogService, syncService, bus }) {
    this.listingService = listingService;
    this.harvestService = harvestService;
    this.catalogService = catalogService;
    this.syncService = syncService;
    this.bus = bus;
  }

  // ---- Listings
  async listListings(search) {
    return (await this.listingService.list({ search })).map(toListingDto);
  }

  async getListing(id) {
    return toListingDto(await this.listingService.get(id));
  }

  async listMyListings(producerId) {
    return (await this.listingService.byProducer(producerId)).map(toListingDto);
  }

  async publishListing(producerId, dto) {
    return toListingDto(await this.listingService.publish(producerId, dto));
  }

  async editListing(id, producerId, dto) {
    return toListingDto(await this.listingService.edit(id, producerId, dto));
  }

  async deleteListing(id, producerId) {
    await this.listingService.remove(id, producerId);
  }

  async uploadListingPhoto(id, producerId, photo) {
    return toListingDto(await this.listingService.uploadPhoto(id, producerId, photo));
  }

  // ---- Harvests
  async createHarvest(producerId, data) {
    return toHarvestDto(await this.harvestService.create({ ...data, producerId }));
  }

  async updateHarvest(id, producerId, changes, timestamp) {
    return toHarvestUpdateDto(await this.harvestService.update(id, changes, { producerId, timestamp }));
  }

  async uploadHarvestPhoto(id, producerId, photo) {
    return toHarvestDto(await this.harvestService.uploadPhoto(id, producerId, photo));
  }

  async reserveHarvest(id, quantity) {
    return toHarvestDto(await this.harvestService.reserve(id, quantity));
  }

  async releaseHarvest(id, quantity) {
    return toHarvestDto(await this.harvestService.release(id, quantity));
  }

  // ---- Read queries
  async getCatalog(filter) {
    return (await this.catalogService.catalog(filter)).map(toCatalogItemDto);
  }

  async getSeason() {
    return (await this.catalogService.season()).map(toSeasonMonthDto);
  }

  async getProducerProfile(producerId) {
    return toProfileDto(await this.catalogService.producerProfile(producerId));
  }

  async getHarvestsByIds(ids) {
    return (await this.catalogService.harvestsByIds(ids)).map(toHarvestDto);
  }

  // ---- Offline synchronization
  async applySyncBatch(producerId, { deviceId, operations }) {
    const { serverAt, results } = await this.syncService.applyBatch({ deviceId, producerId, operations });
    return { serverAt, results: results.map(toSyncResultDto) };
  }

  /**
   * Subscribes to the harvest changes (Observer). Returns the function that cancels the subscription.
   * @param {(change: {harvestId: string, producerId: string}) => void} listener
   */
  subscribeToHarvestChanges(listener) {
    const onChange = (harvest) => listener({ harvestId: harvest.id, producerId: harvest.producerId });
    this.bus.on(EventBus.HARVEST_CHANGED, onChange);
    return () => this.bus.off(EventBus.HARVEST_CHANGED, onChange);
  }
}
