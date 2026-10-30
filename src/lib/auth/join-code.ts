import { timingSafeEqual } from 'crypto';

/**
 * Compares a shared code from a request with the expected one in constant time,
 * so response timing does not help someone guess it. A length mismatch returns
 * early, which only reveals the length.
 */
export function codeMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Why the parent join code was not accepted. */
export type JoinCodeCheck = 'ok' | 'wrong' | 'unconfigured';

/**
 * Checks the code in the parent join link (`/join?code=...`) against
 * `PARENT_JOIN_CODE`. Anyone holding a valid code may become a Parent
 * (`docs/arch_decisions.md`, 2026-10-25), so the server re-checks it on every
 * step and never trusts that the page already did. Rotating the env var retires
 * every link that carries the old code.
 */
export function checkParentJoinCode(input: unknown): JoinCodeCheck {
  const expected = process.env.PARENT_JOIN_CODE;
  if (!expected) {
    console.error('Missing env: PARENT_JOIN_CODE');
    return 'unconfigured';
  }
  if (typeof input !== 'string' || !codeMatches(input.trim(), expected)) return 'wrong';
  return 'ok';
}
