import { createHash } from 'crypto';
import { ApiError } from '../types';

const MAX_TOKEN_CHARS = 600;

// Turns what a voter typed into one canonical form: digits only, hyphens removed, leading zeros
// dropped. "09425-64640" and "0942564640" are the same token. Anything else is rejected.
export function normalizeToken(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ApiError(400, 'INVALID_TOKEN_FORMAT', 'A voter token is required.');
  }
  const text = raw.trim();
  if (text.length > MAX_TOKEN_CHARS || !/^[0-9-]+$/.test(text)) {
    throw new ApiError(400, 'INVALID_TOKEN_FORMAT', 'The voter token must contain only digits and hyphens.');
  }
  const digits = text.replace(/-/g, '');
  if (digits === '') {
    throw new ApiError(400, 'INVALID_TOKEN_FORMAT', 'The voter token must contain digits.');
  }
  return BigInt(digits).toString();
}

// Tokens are stored only as hashes, so reading the database does not reveal a usable token.
export function hashToken(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}
