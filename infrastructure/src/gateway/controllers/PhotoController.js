import { sendImmutableImage } from './imageResponse.js';

/**
 * REST ↔ gRPC (catalog-service): the listing photos at /uploads/<uuid>.<ext>, the same URL as before,
 * so the frontend does not change. The photos live in Neon (table photo); this only forwards them.
 */
export class PhotoController {
  /** @param {{catalog: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ catalog }) {
    this.catalog = catalog;
  }

  get = async (req, res) => {
    sendImmutableImage(res, await this.catalog.call('GetPhoto', { fileName: req.params.file }));
  };
}
