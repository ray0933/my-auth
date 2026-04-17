import crypto from 'crypto';

function base32Decode(str: string): Buffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s = str.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of s) {
    const idx = chars.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes).map((b) => chars[b % 32]).join('');
}

export function generateTotpCode(secret: string, time = Date.now()): string {
  const counter = Math.floor(time / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const now = Date.now();
  for (const delta of [-1, 0, 1]) {
    if (generateTotpCode(secret, now + delta * 30_000) === token) return true;
  }
  return false;
}

export function buildOtpAuthUri(secret: string, account: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
