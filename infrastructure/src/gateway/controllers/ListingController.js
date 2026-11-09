import { listingJson, myListingJson } from '../restMappers.js';
import { photoUpload } from './photoUpload.js';

/** REST ↔ gRPC (catalog-service): listings. The producer is the session user (metadata). */
export class ListingController {
  /** @param {{catalog: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ catalog }) {
    this.catalog = catalog;
  }

  list = async (req, res) => {
    res.set('Cache-Control', 'no-cache'); // the browser revalidates with ETag → 304 with no body if unchanged
    const search = req.query.q == null ? undefined : String(req.query.q);
    const { listings } = await this.catalog.call('ListListings', { search });
    res.json(listings.map(listingJson));
  };

  mine = async (_req, res) => {
    const { listings } = await this.catalog.call('ListMyListings');
    res.json(listings.map(myListingJson));
  };

  get = async (req, res) => {
    res.json(listingJson(await this.catalog.call('GetListing', { id: req.params.id })));
  };

  publish = async (req, res) => {
    const { product, description, price, quantity, unit, category, availableOn } = req.body ?? {};
    const listing = await this.catalog.call('PublishListing', { product, description, price, quantity, unit, category, availableOn });
    res.status(201).json(listingJson(listing));
  };

  edit = async (req, res) => {
    const { product, description, price, quantity, availableOn } = req.body ?? {};
    res.json(listingJson(await this.catalog.call('EditListing', { id: req.params.id, product, description, price, quantity, availableOn })));
  };

  remove = async (req, res) => {
    await this.catalog.call('DeleteListing', { id: req.params.id });
    res.sendStatus(204);
  };

  uploadPhoto = async (req, res) => {
    res.status(201).json(listingJson(await this.catalog.call('UploadListingPhoto', photoUpload(req))));
  };
}
