import { userJson } from '../restMappers.js';
import { sendImmutableImage, imageUpload } from './imageResponse.js';

/**
 * REST ↔ gRPC (user-service): the profile of the session user (data and photo) and the profile
 * photos at /avatars/<uuid>.<ext>. The user who edits comes from the session (metadata), never from the body.
 */
export class ProfileController {
  /** @param {{user: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ user }) {
    this.user = user;
  }

  update = async (req, res) => {
    const { name, phone, farm, village, town, type } = req.body ?? {};
    res.json(userJson(await this.user.call('UpdateProfile', { name, phone, farm, village, town, type })));
  };

  uploadAvatar = async (req, res) => {
    res.status(201).json(userJson(await this.user.call('UploadAvatar', imageUpload(req))));
  };

  avatar = async (req, res) => {
    sendImmutableImage(res, await this.user.call('GetAvatar', { fileName: req.params.file }));
  };
}
