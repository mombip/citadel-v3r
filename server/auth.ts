/**
 * Password hashing (PBKDF2-HMAC-SHA256, 200 000 iterations, 16-byte hex salt) — identical to the
 * original, so existing accounts keep working — and a signed, stateless session cookie.
 */
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const generateSalt = () => randomBytes(16).toString("hex");

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from(salt, "utf8"), 200_000, 32, "sha256").toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const computed = Buffer.from(hashPassword(password, salt));
  const expected = Buffer.from(expectedHash);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export interface SessionPayload {
  uid: number;
  sv: number;
  iat: number;
}

const secret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function encodeSession(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "citadel_session";
