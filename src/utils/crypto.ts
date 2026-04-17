import argon2 from 'argon2';
import crypto from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateTempPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+-=';
  const all = upper + lower + digits + symbols;

  const pick = (set: string) => set[crypto.randomBytes(1)[0]! % set.length]!;

  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from(crypto.randomBytes(20)).map((b) => all[b % all.length]!);
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join('');
}
