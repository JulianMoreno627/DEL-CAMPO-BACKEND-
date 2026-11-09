import express from 'express';

/** Image types the client may send (already compressed by its Web Worker). */
export const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/** Reads the binary body (max. 600 KB; larger → 413, same as before). */
export const rawPhoto = express.raw({ type: IMAGE_TYPES, limit: '600kb' });

/**
 * PhotoUpload message for catalog-service: the photo travels over gRPC as `bytes`.
 * If the body is not an accepted image, an empty content is sent and catalog-service answers
 * "Envíe una imagen WebP, JPEG o PNG" (400), as before.
 */
export const photoUpload = (req) => ({
  id: req.params.id,
  content: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
  contentType: req.get('Content-Type') ?? '',
});
