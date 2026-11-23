/**
 * Fernet (https://github.com/fernet/spec) implemented on node:crypto, wire
 * compatible with Python's `cryptography.fernet.Fernet`, so votes encrypted by
 * the FastAPI backend keep decrypting and vice versa.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class InvalidToken extends Error {
  constructor() {
    super('Invalid Fernet token');
  }
}

const VERSION = 0x80;

function urlsafeB64Decode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function urlsafeB64Encode(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

export class Fernet {
  private readonly signingKey: Buffer;
  private readonly encryptionKey: Buffer;

  constructor(key: string) {
    const raw = urlsafeB64Decode(key);
    if (raw.length !== 32) throw new Error('Fernet key must be 32 url-safe base64-encoded bytes.');
    this.signingKey = raw.subarray(0, 16);
    this.encryptionKey = raw.subarray(16);
  }

  encrypt(data: Buffer, now: number = Date.now(), iv: Buffer = randomBytes(16)): string {
    const cipher = createCipheriv('aes-128-cbc', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(BigInt(Math.floor(now / 1000)));
    const basicParts = Buffer.concat([Buffer.from([VERSION]), timestamp, iv, ciphertext]);
    const hmac = createHmac('sha256', this.signingKey).update(basicParts).digest();
    return urlsafeB64Encode(Buffer.concat([basicParts, hmac]));
  }

  /** Decrypts without a TTL, like `Fernet.decrypt(token)` in Python. */
  decrypt(token: string): Buffer {
    const data = urlsafeB64Decode(token);
    if (data.length < 1 + 8 + 16 + 32 || data[0] !== VERSION) throw new InvalidToken();
    const basicParts = data.subarray(0, data.length - 32);
    const signature = data.subarray(data.length - 32);
    const expected = createHmac('sha256', this.signingKey).update(basicParts).digest();
    if (!timingSafeEqual(signature, expected)) throw new InvalidToken();
    const iv = data.subarray(9, 25);
    const ciphertext = data.subarray(25, data.length - 32);
    try {
      const decipher = createDecipheriv('aes-128-cbc', this.encryptionKey, iv);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new InvalidToken();
    }
  }
}
