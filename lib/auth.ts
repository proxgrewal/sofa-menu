// SOFA-16 — owner authentication for the restaurant admin.
//
// The admin panel edits live prices, dishes and photos, so it must not be open
// to the public. We gate it behind a single owner password and a stateless,
// HMAC-signed session cookie. Everything here uses the Web Crypto API
// (`crypto.subtle`), which is available in BOTH the Node.js server runtime (API
// routes) and the Edge runtime (middleware) — so the same helpers verify a
// session in either place with no extra dependency.
//
// Configuration (with dev-friendly defaults so the app still runs with zero
// setup — see `docs/SOFA-16-admin-auth.md`):
//   ADMIN_PASSWORD        the owner's password              (default below)
//   ADMIN_SESSION_SECRET  HMAC key for signing sessions     (default below)
//   ADMIN_SESSION_TTL_H   session lifetime in hours         (default 12)

export const SESSION_COOKIE = "sofa_admin";

const DEV_PASSWORD = "sofa-admin";
const DEV_SECRET = "dev-insecure-secret-change-me";

function password(): string {
  return process.env.ADMIN_PASSWORD || DEV_PASSWORD;
}

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || DEV_SECRET;
}

function ttlMs(): number {
  const hours = Number(process.env.ADMIN_SESSION_TTL_H) || 12;
  return hours * 60 * 60 * 1000;
}

/** True when the deployment is still running on the built-in dev defaults. */
export function usingInsecureDefaults(): boolean {
  return !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET;
}

// --- base64url helpers (no padding), byte-safe -----------------------------

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Constant-time-ish comparison of two byte arrays.
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

type SessionPayload = { sub: string; exp: number };

/** Verify a plaintext password against the configured owner password. */
export function checkPassword(candidate: string): boolean {
  const expected = enc.encode(password());
  const got = enc.encode(candidate ?? "");
  return bytesEqual(expected, got);
}

/** Mint a signed session token for the owner. */
export async function createSession(): Promise<{ token: string; maxAgeSec: number }> {
  const maxAge = ttlMs();
  const payload: SessionPayload = { sub: "owner", exp: nowMs() + maxAge };
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  const token = `${body}.${toB64Url(new Uint8Array(sig))}`;
  return { token, maxAgeSec: Math.floor(maxAge / 1000) };
}

/**
 * Verify a session token. Returns the payload when the signature is valid and
 * the session has not expired, otherwise null. Safe to call in middleware.
 */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let ok: boolean;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64Url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as SessionPayload;
    if (!payload || payload.sub !== "owner" || typeof payload.exp !== "number") return null;
    if (payload.exp < nowMs()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Isolated so the (rare) environments without a global Date still fail loudly
// rather than silently minting never-expiring sessions.
function nowMs(): number {
  return Date.now();
}
