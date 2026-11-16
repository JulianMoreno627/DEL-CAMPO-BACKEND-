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
    const { content, contentType } = await this.catalog.call('GetPhoto', { fileName: req.params.file });
    // The name is a new uuid on every upload: the content of a URL never changes, so it can be cached for a year
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin'); // shown by the frontend, which lives on Vercel
    res.type(contentType).send(Buffer.from(content));
  };
}
