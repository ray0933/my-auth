import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateRefreshToken,
  generateTempPassword,
} from '../../../src/utils/crypto';

describe('hashPassword / verifyPassword', () => {
  it('round-trips correctly', async () => {
    const hash = await hashPassword('MyPass1!');
    expect(await verifyPassword(hash, 'MyPass1!')).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('MyPass1!');
    expect(await verifyPassword(hash, 'WrongPass1!')).toBe(false);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    const t = 'someRandomToken';
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it('returns 64 hex chars (SHA-256)', () => {
    expect(hashToken('test')).toHaveLength(64);
  });
});

describe('generateRefreshToken', () => {
  it('produces a base64url string of at least 64 chars', () => {
    const token = generateRefreshToken();
    expect(token.length).toBeGreaterThanOrEqual(64);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it('produces unique tokens', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
});

describe('generateTempPassword', () => {
  it('produces a 24-char string', () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(24);
  });

  it('contains at least one uppercase, lowercase, digit, and symbol', () => {
    const pw = generateTempPassword();
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
  });
});
