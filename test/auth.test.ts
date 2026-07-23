// Auth scope tests: superadmin vs per-restaurant owner resolution, session
// round-trip, and cross-restaurant access checks.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "super-secret";
process.env.ADMIN_SESSION_SECRET = "test-secret-key";
process.env.SOFA_OWNERS = JSON.stringify({ "pilot-diner": "diner-pw", "olive-grove": "grove-pw" });

const { authenticate, canAccess, createSession, verifySession, SCOPE_ALL } =
  await import("../lib/auth");

test("authenticate resolves scope from which password matched", () => {
  assert.equal(authenticate("super-secret"), SCOPE_ALL);
  assert.equal(authenticate("diner-pw"), "pilot-diner");
  assert.equal(authenticate("grove-pw"), "olive-grove");
  assert.equal(authenticate("wrong"), null);
  assert.equal(authenticate(""), null);
});

test("canAccess enforces scope boundaries", async () => {
  const superToken = (await createSession(SCOPE_ALL)).token;
  const ownerToken = (await createSession("pilot-diner")).token;
  const superSession = await verifySession(superToken);
  const ownerSession = await verifySession(ownerToken);

  assert.ok(superSession && ownerSession);
  // Superadmin can touch any restaurant.
  assert.equal(canAccess(superSession, "pilot-diner"), true);
  assert.equal(canAccess(superSession, "olive-grove"), true);
  // Owner is confined to their own.
  assert.equal(canAccess(ownerSession, "pilot-diner"), true);
  assert.equal(canAccess(ownerSession, "olive-grove"), false);
  // No session -> no access.
  assert.equal(canAccess(null, "pilot-diner"), false);
});

test("verifySession rejects a tampered token", async () => {
  const { token } = await createSession("pilot-diner");
  const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
  assert.equal(await verifySession(tampered), null);
});
