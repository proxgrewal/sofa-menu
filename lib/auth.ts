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

// A session's scope: "all" is a superadmin (ADMIN_PASSWORD) who can manage every
// restaurant; otherwise it's a single restaurant slug (a per-restaurant owner
// from SOFA_OWNERS). See docs/SOFA-16-admin-auth.md.
export const SCOPE_ALL = "all";

const DEV_PASSWORD = "sofa-admin";
const DEV_SECRET = "dev-insecure-secret-change-me";

function password(): string {
  return process.env.ADMIN_PASSWORD || DEV_PASSWORD;
}

/** Parse SOFA_OWNERS (JSON map of slug -> password); {} when unset/invalid. */
function owners(): Record<string, string> {
  const raw = process.env.SOFA_OWNERS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
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
    ["sign", "verify"]
  );
}

// Constant-time-ish comparison of two byte arrays.
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type SessionPayload = { sub: string; exp: number; scope: string };

function eqStr(a: string, b: string): boolean {
  return bytesEqual(enc.encode(a), enc.encode(b));
}

/**
 * Authenticate a plaintext password and resolve its scope. Returns SCOPE_ALL for
 * the superadmin password, a restaurant slug for a per-restaurant owner, or null
 * if nothing matches. Every configured password is checked (no early return) so
 * timing doesn't leak which passwords exist.
 */
export function authenticate(candidate: string): string | null {
  const pw = candidate ?? "";
  let scope: string | null = null;
  if (eqStr(password(), pw)) scope = SCOPE_ALL;
  for (const [slug, ownerPw] of Object.entries(owners())) {
    if (eqStr(ownerPw, pw) && scope === null) scope = slug;
  }
  return scope;
}

/** Back-compat: true when the password is valid for any scope. */
export function checkPassword(candidate: string): boolean {
  return authenticate(candidate) !== null;
}

/** True when a session may manage the given restaurant slug. */
export function canAccess(session: SessionPayload | null, slug: string): boolean {
  if (!session) return false;
  return session.scope === SCOPE_ALL || session.scope === slug;
}

/** Mint a signed session token for the owner with the given scope. */
export async function createSession(scope: string): Promise<{ token: string; maxAgeSec: number }> {
  const maxAge = ttlMs();
  const payload: SessionPayload = { sub: "owner", exp: nowMs() + maxAge, scope };
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  const token = `${body}.${toB64Url(new Uint8Array(sig))}`;
  return { token, maxAgeSec: Math.floor(maxAge / 1000) };
}

/**
 * Verify a session token. Returns the payload when the signature is valid and
 * the session has not expired, otherwise null. Safe to call in middleware.
 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
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
    if (typeof payload.scope !== "string" || !payload.scope) return null;
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
