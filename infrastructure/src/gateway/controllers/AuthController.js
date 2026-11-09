import { sessionJson, userJson } from '../restMappers.js';

/** REST ↔ gRPC (user-service): sign-up, login and current user. No business logic here. */
export class AuthController {
  /** @param {{user: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ user }) {
    this.user = user;
  }

  register = async (req, res) => {
    const { role, name, email, password, phone, town, village, farm, type } = req.body ?? {};
    const session = await this.user.call('Register', { role, name, email, password, phone, town, village, farm, type });
    res.status(201).json(sessionJson(session));
  };

  login = async (req, res) => {
    const { email, password, role } = req.body ?? {};
    res.json(sessionJson(await this.user.call('Login', { email, password, role })));
  };

  me = async (req, res) => {
    res.json(userJson(await this.user.call('GetUser', { id: req.userId })));
  };
}
