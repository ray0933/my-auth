import { AccessTokenPayload } from './index';

declare global {
  namespace Express {
    interface Request {
      user: AccessTokenPayload;
    }
  }
}
