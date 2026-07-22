// ---------------------------------------------------------------------------
// Order domain + store (SOFA-6: guest ordering flow)
//
// Deliberately free of any `next/*` imports so the order core is pure and
// unit-testable under plain Node. Persistence is a small JSON file so orders
// placed by a guest survive across requests and are visible to the restaurant.
// The shapes mirror a relational schema (stable ids + foreign keys by slug) so
// swapping this for a real database is a drop-in change behind the exported
// functions.
//
// Payments are intentionally STUBBED. See `capturePayment()` for the single
// integration point where a real PSP (Stripe PaymentIntent) would slot in.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getRestaurantBySlug, type Restaurant } from "./data";

export type OrderStatus =
  | "placed" // guest submitted; kitchen has not acknowledged
  | "in_progress" // kitchen is preparing
  | "ready" // ready for the table
  | "completed" // delivered / closed
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "deferred";

/** A line the guest is ordering: a dish id + quantity. Priced server-side. */
export type OrderItemInput = {
  dishId: string;
  quantity: number;
};

/** A priced line snapshot stored on the order (name/price captured at order
 * time so later menu edits don't rewrite history). */
export type OrderLine = {
  dishId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export type Order = {
  id: string;
  /** Human-friendly ticket number shown to guest + kitchen, e.g. "OG-0007". */
  ticket: string;
  restaurantSlug: string;
  restaurantName: string;
  tableLabel: string;
  currency: string;
  lines: OrderLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  note: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderError";
    this.status = status;
  }
}

// --- Config --------------------------------------------------------------

/** Flat tax rate applied to the subtotal. A real system would resolve this per
 * jurisdiction; kept as one knob for the pilot. */
const TAX_RATE = 0.0825;

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// --- Persistence ---------------------------------------------------------

function readAll(): Order[] {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

function writeAll(orders: Order[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${ORDERS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2));
  fs.renameSync(tmp, ORDERS_FILE); // atomic swap to avoid torn reads
}

// --- Pricing / validation (pure) ----------------------------------------

/** Index every dish in a restaurant menu by id for O(1) pricing lookups. */
function indexDishes(restaurant: Restaurant): Map<
  string,
  { name: string; priceCents: number }
> {
  const map = new Map<string, { name: string; priceCents: number }>();
  for (const cat of restaurant.menu.categories) {
    for (const dish of cat.dishes) {
      map.set(dish.id, { name: dish.name, priceCents: dish.priceCents });
    }
  }
  return map;
}

/**
 * Price a cart against a restaurant's live menu. Pure: no persistence, no side
 * effects. Throws OrderError on an empty cart, unknown dish, or bad quantity so
 * the guest can't place an order the kitchen can't fulfil.
 */
export function priceCart(
  restaurant: Restaurant,
  items: OrderItemInput[]
): { lines: OrderLine[]; subtotalCents: number; taxCents: number; totalCents: number } {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderError("Cart is empty.");
  }
  const dishes = indexDishes(restaurant);

  // Collapse duplicate dishIds into a single line with summed quantity.
  const merged = new Map<string, number>();
  for (const item of items) {
    const qty = Number(item?.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new OrderError(`Invalid quantity for item "${item?.dishId}".`);
    }
    if (qty > 99) {
      throw new OrderError(`Quantity too large for item "${item?.dishId}".`);
    }
    merged.set(item.dishId, (merged.get(item.dishId) ?? 0) + qty);
  }

  const lines: OrderLine[] = [];
  for (const [dishId, quantity] of merged) {
    const dish = dishes.get(dishId);
    if (!dish) {
      throw new OrderError(`Dish "${dishId}" is not on the menu.`, 404);
    }
    lines.push({
      dishId,
      name: dish.name,
      unitPriceCents: dish.priceCents,
      quantity,
      lineTotalCents: dish.priceCents * quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;
  return { lines, subtotalCents, taxCents, totalCents };
}

// --- Payment stub (integration point) -----------------------------------

/**
 * STUB. Payments are deferred for the pilot (SOFA-6 scope note). This is the
 * single seam where a real payment service plugs in.
 *
 * To integrate Stripe: create a PaymentIntent for `amountCents`/`currency`
 * before/at order placement, confirm it client-side, then set the resulting
 * order's paymentStatus to "paid" on webhook. Until then every order is
 * recorded as "deferred" (pay-at-table / pay-on-pickup).
 */
export function capturePayment(_amountCents: number, _currency: string): {
  status: PaymentStatus;
} {
  return { status: "deferred" };
}

// --- Ticket numbering ----------------------------------------------------

function ticketPrefix(restaurant: Restaurant): string {
  const letters = restaurant.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  return letters || "ORD";
}

// --- Public API ----------------------------------------------------------

export type PlaceOrderInput = {
  restaurantSlug: string;
  tableLabel?: string;
  items: OrderItemInput[];
  note?: string;
};

/**
 * Validate + price + persist a guest order against a restaurant/table.
 * Returns the created Order. This is the write half of the DoD loop.
 */
export function placeOrder(input: PlaceOrderInput): Order {
  const restaurant = getRestaurantBySlug(input?.restaurantSlug ?? "");
  if (!restaurant) {
    throw new OrderError("Restaurant not found.", 404);
  }

  const priced = priceCart(restaurant, input.items);
  const payment = capturePayment(priced.totalCents, restaurant.currency);

  const all = readAll();
  const seq = all.filter((o) => o.restaurantSlug === restaurant.slug).length + 1;
  const now = new Date().toISOString();

  const order: Order = {
    id: crypto.randomUUID(),
    ticket: `${ticketPrefix(restaurant)}-${String(seq).padStart(4, "0")}`,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableLabel: (input.tableLabel ?? "").trim() || "Takeaway",
    currency: restaurant.currency,
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    taxCents: priced.taxCents,
    totalCents: priced.totalCents,
    status: "placed",
    paymentStatus: payment.status,
    note: (input.note ?? "").trim().slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };

  all.push(order);
  writeAll(all);
  return order;
}

export function getOrder(id: string): Order | undefined {
  return readAll().find((o) => o.id === id);
}

/** Restaurant-facing: every order for a restaurant, newest first. */
export function listOrders(restaurantSlug: string): Order[] {
  return readAll()
    .filter((o) => o.restaurantSlug === restaurantSlug)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  placed: "in_progress",
  in_progress: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

/** Restaurant-facing: advance an order through its lifecycle (or cancel). */
export function updateOrderStatus(id: string, status: OrderStatus): Order {
  const all = readAll();
  const order = all.find((o) => o.id === id);
  if (!order) throw new OrderError("Order not found.", 404);
  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeAll(all);
  return order;
}

export { NEXT_STATUS };
