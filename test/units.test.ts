// Unit tests for the pure helpers added alongside the payments / multi-tenant /
// analytics work. Run with:  node --import ./test/ts-resolve.mjs --test test/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

const { summarizeOrders } = await import("../lib/analytics");
const { parseOrderInput, ValidationError } = await import("../lib/validate");
const { rateLimit } = await import("../lib/ratelimit");

// --- analytics -------------------------------------------------------------

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    ticket: "T-0001",
    restaurantSlug: "s",
    restaurantName: "S",
    tableLabel: "1",
    currency: "USD",
    lines: [
      { dishId: "d1", name: "Burger", unitPriceCents: 500, quantity: 2, lineTotalCents: 1000 },
      { dishId: "d2", name: "Fries", unitPriceCents: 300, quantity: 1, lineTotalCents: 300 },
    ],
    subtotalCents: 1300,
    taxCents: 0,
    totalCents: 1300,
    status: "completed",
    paymentStatus: "paid",
    note: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

test("summarizeOrders aggregates revenue, items and best sellers", () => {
  const s = summarizeOrders([order(), order({ id: "o2", paymentStatus: "deferred" })] as never);
  assert.equal(s.orderCount, 2);
  assert.equal(s.grossRevenueCents, 2600);
  assert.equal(s.paidRevenueCents, 1300); // only the paid one
  assert.equal(s.itemsSold, 6); // (2+1) * 2 orders
  assert.equal(s.avgOrderValueCents, 1300);
  assert.equal(s.topItems[0].dishId, "d1");
  assert.equal(s.topItems[0].quantity, 4);
});

test("summarizeOrders excludes cancelled orders from revenue", () => {
  const s = summarizeOrders([order({ status: "cancelled" })] as never);
  assert.equal(s.orderCount, 0);
  assert.equal(s.grossRevenueCents, 0);
  assert.equal(s.ordersByStatus.cancelled, 1);
});

// --- validation ------------------------------------------------------------

test("parseOrderInput accepts a well-formed payload", () => {
  const out = parseOrderInput({
    restaurantSlug: "pilot-diner",
    items: [{ dishId: "pdish_1", quantity: 2 }],
    note: "no onions",
  });
  assert.equal(out.restaurantSlug, "pilot-diner");
  assert.equal(out.items[0].quantity, 2);
  assert.equal(out.note, "no onions");
});

test("parseOrderInput rejects bad payloads", () => {
  assert.throws(() => parseOrderInput(null), ValidationError);
  assert.throws(() => parseOrderInput({ restaurantSlug: "s", items: [] }), ValidationError);
  assert.throws(
    () => parseOrderInput({ restaurantSlug: "s", items: [{ dishId: "d", quantity: 0 }] }),
    ValidationError
  );
  assert.throws(
    () => parseOrderInput({ restaurantSlug: "s", items: [{ dishId: "d", quantity: 200 }] }),
    ValidationError
  );
});

// --- rate limiting ---------------------------------------------------------

test("rateLimit blocks once the window limit is exceeded", () => {
  const key = "test:unit:" + Math.floor(performance.now());
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 60_000).ok, true);
  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 1);
});
