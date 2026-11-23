import * as jwt from 'jsonwebtoken';
import { getEnv } from '../../config/env';

const ALGORITHM = 'HS256';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AccessTokenPayload {
  userId: string;
  email: string;
  name: string;
  exp?: number;
}

function secret(): string {
  const value = getEnv('JWT_SECRET');
  if (!value) throw new Error('JWT secret is not configured.');
  return value;
}

/**
 * Same token python-jose produced: HS256, the given claims plus `exp`
 * (now + 7 days) and no `iat`, so tokens work across both backends.
 */
export function createAccessToken(payload: Omit<AccessTokenPayload, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return jwt.sign({ ...payload, exp }, secret(), { algorithm: ALGORITHM, noTimestamp: true });
}

export function decodeAccessToken(token: string): AccessTokenPayload {
  const key = secret();
  try {
    return jwt.verify(token, key, { algorithms: [ALGORITHM] }) as AccessTokenPayload;
  } catch {
    throw new Error('Invalid token');
  }
}
