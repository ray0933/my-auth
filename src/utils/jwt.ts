import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { AccessTokenPayload } from '../types';
import { AppError } from './AppError';

function decodeKey(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'jti'>
): string {
  const privateKey = decodeKey(env.JWT_PRIVATE_KEY);
  return jwt.sign({ ...payload, jti: uuidv4() }, privateKey, {
    algorithm: 'RS256',
    expiresIn: env.JWT_ACCESS_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const publicKey = decodeKey(env.JWT_PUBLIC_KEY);
  try {
    return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as AccessTokenPayload;
  } catch (err) {
    throw new AppError('TOKEN_EXPIRED', 401);
  }
}
