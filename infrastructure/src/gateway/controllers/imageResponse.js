/**
 * Sends an image that came from a microservice over gRPC. The file name is a new uuid on every
 * upload, so the content of a URL never changes and it can be cached for a year.
 */
export function sendImmutableImage(res, { content, contentType }) {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin'); // shown by the frontend, which lives on Vercel
  res.type(contentType).send(Buffer.from(content));
}

/** Image body of an upload (binary, max. 600 KB): an empty content if it is not an accepted image. */
export const imageUpload = (req) => ({
  content: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
  contentType: req.get('Content-Type') ?? '',
});
