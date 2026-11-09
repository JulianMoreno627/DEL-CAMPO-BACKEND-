import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Session token signed with HMAC-SHA256 (same principle as a JWT HS256):
 * nobody stores sessions, the signature and the expiration are verified.
 * - user-service SIGNS it at login / sign-up.
 * - the gateway VERIFIES it locally with the same TOKEN_SECRET (no gRPC call per request).
 * Format: base64url(JSON {sub, role, exp}) + "." + base64url(signature). It is the same
 * format as before the migration, so the sessions already open keep working.
 */
export class SessionToken {
  static DURATION_MS = 7 * 86_400_000;

  /** @param {string|Buffer} secret */
  constructor(secret) {
    if (!secret || secret.length === 0) throw new Error('SessionToken needs a secret (TOKEN_SECRET)');
    this.secret = secret;
  }

  sign({ sub, role }, durationMs = SessionToken.DURATION_MS) {
    const body = Buffer.from(JSON.stringify({ sub, role, exp: Date.now() + durationMs })).toString('base64url');
    return `${body}.${this.#signature(body)}`;
  }

  /** @returns {{ sub: string, role: string, exp: number } | null} */
  verify(token) {
    const [body, signature] = String(token ?? '').split('.');
    if (!body || !signature) return null;
    const expected = Buffer.from(this.#signature(body));
    const received = Buffer.from(signature);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString());
      return data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  #signature(body) {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
