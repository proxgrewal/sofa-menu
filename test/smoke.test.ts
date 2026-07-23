// Smoke test for the SOFA-6 order core. Runs under Node's native TypeScript
// type-stripping (no build step, no next runtime):
//   node --test test/smoke.test.ts
// It exercises the full guest->restaurant loop against a temp data dir.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the order store at an isolated temp cwd so we never touch real data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sofa-orders-"));
const realCwd = process.cwd();
process.chdir(tmp);

const {
  priceCart,
  placeOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
  capturePayment,
  OrderError,
} = await import("../lib/orders");
const { getRestaurantBySlug } = await import("../lib/data");

const restaurant = getRestaurantBySlug("olive-grove")!;

test("priceCart sums lines + tax and merges duplicate dishes", () => {
  const priced = priceCart(restaurant, [
    { dishId: "dish_1", quantity: 2 }, // 1100 each
    { dishId: "dish_1", quantity: 1 }, // merged -> qty 3
    { dishId: "dish_3", quantity: 1 }, // 3200
  ]);
  assert.equal(priced.lines.length, 2, "duplicate dishIds merge into one line");
  const feta = priced.lines.find((l) => l.dishId === "dish_1")!;
  assert.equal(feta.quantity, 3);
  assert.equal(feta.lineTotalCents, 3300);
  assert.equal(priced.subtotalCents, 3300 + 3200);
  assert.equal(priced.taxCents, Math.round(priced.subtotalCents * 0.0825));
  assert.equal(priced.totalCents, priced.subtotalCents + priced.taxCents);
});

test("priceCart rejects empty carts, bad quantities, unknown dishes", () => {
  assert.throws(() => priceCart(restaurant, []), OrderError);
  assert.throws(() => priceCart(restaurant, [{ dishId: "dish_1", quantity: 0 }]), OrderError);
  assert.throws(() => priceCart(restaurant, [{ dishId: "dish_1", quantity: 1.5 }]), OrderError);
  assert.throws(() => priceCart(restaurant, [{ dishId: "nope", quantity: 1 }]), OrderError);
});

test("payment is stubbed as deferred (integration point)", () => {
  assert.deepEqual(capturePayment(5000, "USD"), { status: "deferred" });
});

test("placeOrder persists an order the restaurant can see", async () => {
  const order = await placeOrder({
    restaurantSlug: "olive-grove",
    tableLabel: "12",
    items: [{ dishId: "dish_3", quantity: 1 }],
    note: "no salt",
  });
  assert.match(order.ticket, /^OG-\d{4}$/);
  assert.equal(order.status, "placed");
  assert.equal(order.paymentStatus, "deferred");
  assert.equal(order.tableLabel, "12");

  // Guest can re-fetch their confirmation.
  const fetched = (await getOrder(order.id))!;
  assert.equal(fetched.id, order.id);

  // Restaurant sees it in its order list.
  const visible = await listOrders("olive-grove");
  assert.ok(
    visible.some((o) => o.id === order.id),
    "order visible to restaurant"
  );

  // Restaurant advances it through the lifecycle.
  assert.equal((await updateOrderStatus(order.id, "in_progress")).status, "in_progress");
  assert.equal((await getOrder(order.id))!.status, "in_progress");
});

test("placeOrder rejects unknown restaurant", async () => {
  await assert.rejects(
    () => placeOrder({ restaurantSlug: "ghost", items: [{ dishId: "x", quantity: 1 }] }),
    OrderError
  );
});

test.after(() => {
  process.chdir(realCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});
