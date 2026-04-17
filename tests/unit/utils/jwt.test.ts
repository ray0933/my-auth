import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../../../src/utils/jwt';
import { AppError } from '../../../src/utils/AppError';

describe('JWT utilities', () => {
  const payload = {
    sub: 'user-id-123',
    email: 'test@example.com',
    roles: ['user'],
    mustChangePassword: false,
  };

  it('round-trips access token', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.roles).toEqual(payload.roles);
  });

  it('includes jti and exp in decoded payload', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.jti).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('throws AppError TOKEN_EXPIRED for invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here')).toThrow(AppError);
    try {
      verifyAccessToken('invalid');
    } catch (err) {
      expect((err as AppError).code).toBe('TOKEN_EXPIRED');
      expect((err as AppError).statusCode).toBe(401);
    }
  });
});
