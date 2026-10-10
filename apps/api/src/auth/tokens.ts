import { createHash, randomBytes } from 'node:crypto';

/** A 256-bit random, URL-safe opaque token. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are high-entropy, so a fast SHA-256 is enough to store them safely (only hashes hit the DB). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
