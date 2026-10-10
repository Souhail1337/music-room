import { hashToken, randomToken } from './tokens.js';

describe('tokens', () => {
  it('generates distinct 256-bit url-safe tokens', () => {
    const a = randomToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('hashes deterministically and never returns the token itself', () => {
    const token = randomToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
