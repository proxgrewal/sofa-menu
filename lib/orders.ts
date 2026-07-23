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
import { getServiceClient, isSupabaseConfigured } from "./supabase";

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
//
// SOFA-13: orders live in Postgres when Supabase is configured — this is what
// survives Vercel's ephemeral filesystem across redeploys. Otherwise they fall
// back to a local JSON file so the app runs with zero infra in local dev.

function fileReadAll(): Order[] {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

function fileWriteAll(orders: Order[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${ORDERS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2));
  fs.renameSync(tmp, ORDERS_FILE); // atomic swap to avoid torn reads
}

// --- Postgres mapping ----------------------------------------------------

type OrderRow = {
  id: string;
  ticket: string;
  restaurant_slug: string;
  restaurant_name: string;
  table_label: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  note: string;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[] | null;
};
type OrderItemRow = {
  dish_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
};

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    ticket: row.ticket,
    restaurantSlug: row.restaurant_slug,
    restaurantName: row.restaurant_name,
    tableLabel: row.table_label,
    currency: row.currency,
    lines: (row.order_items ?? []).map((i) => ({
      dishId: i.dish_id,
      name: i.name,
      unitPriceCents: i.unit_price_cents,
      quantity: i.quantity,
      lineTotalCents: i.line_total_cents,
    })),
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    status: row.status,
    paymentStatus: row.payment_status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_SELECT =
  "id, ticket, restaurant_slug, restaurant_name, table_label, currency, " +
  "subtotal_cents, tax_cents, total_cents, status, payment_status, note, " +
  "created_at, updated_at, order_items ( dish_id, name, unit_price_cents, quantity, line_total_cents )";

/** Thrown when an order's ticket collides with an existing one (concurrent
 * placement). Callers retry with a fresh sequence number. */
class TicketCollision extends Error {}

async function dbInsertOrder(order: Order): Promise<void> {
  const sb = await getServiceClient();
  const { error: oErr } = await sb.from("orders").insert({
    id: order.id,
    ticket: order.ticket,
    restaurant_slug: order.restaurantSlug,
    restaurant_name: order.restaurantName,
    table_label: order.tableLabel,
    currency: order.currency,
    subtotal_cents: order.subtotalCents,
    tax_cents: order.taxCents,
    total_cents: order.totalCents,
    status: order.status,
    payment_status: order.paymentStatus,
    note: order.note,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  });
  if (oErr) {
    // 23505 = unique_violation (the unique(restaurant_slug, ticket) index in
    // migration 0004). Signal the caller to retry with a fresh sequence.
    if ((oErr as { code?: string }).code === "23505") throw new TicketCollision(oErr.message);
    throw new OrderError(`Could not save order: ${oErr.message}`, 500);
  }

  const { error: iErr } = await sb.from("order_items").insert(
    order.lines.map((l) => ({
      order_id: order.id,
      dish_id: l.dishId,
      name: l.name,
      unit_price_cents: l.unitPriceCents,
      quantity: l.quantity,
      line_total_cents: l.lineTotalCents,
    }))
  );
  if (iErr) throw new OrderError(`Could not save order items: ${iErr.message}`, 500);
}

// --- Pricing / validation (pure) ----------------------------------------

/** Index every dish in a restaurant menu by id for O(1) pricing lookups. */
function indexDishes(restaurant: Restaurant): Map<string, { name: string; priceCents: number }> {
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
export function capturePayment(
  _amountCents: number,
  _currency: string
): {
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
export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const restaurant = getRestaurantBySlug(input?.restaurantSlug ?? "");
  if (!restaurant) {
    throw new OrderError("Restaurant not found.", 404);
  }

  const priced = priceCart(restaurant, input.items);
  const payment = capturePayment(priced.totalCents, restaurant.currency);

  const build = (seq: number): Order => {
    const now = new Date().toISOString();
    return {
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
  };

  // Ticket numbers are `count + 1`, which two concurrent orders can collide on.
  // Retry with a bumped sequence until the insert wins the race. The DB's
  // unique(restaurant_slug, ticket) index (migration 0004) is the source of
  // truth; the file fallback checks existing tickets in-process.
  let seq = (await countOrders(restaurant.slug)) + 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const order = build(seq);
    if (isSupabaseConfigured()) {
      try {
        await dbInsertOrder(order);
        return order;
      } catch (err) {
        if (err instanceof TicketCollision) {
          seq++;
          continue;
        }
        throw err;
      }
    } else {
      const all = fileReadAll();
      if (all.some((o) => o.restaurantSlug === order.restaurantSlug && o.ticket === order.ticket)) {
        seq++;
        continue;
      }
      all.push(order);
      fileWriteAll(all);
      return order;
    }
  }
  throw new OrderError("Could not assign a ticket number; please retry.", 503);
}

async function countOrders(restaurantSlug: string): Promise<number> {
  if (isSupabaseConfigured()) {
    const sb = await getServiceClient();
    const { count, error } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_slug", restaurantSlug);
    if (error) throw new OrderError(`Could not count orders: ${error.message}`, 500);
    return count ?? 0;
  }
  return fileReadAll().filter((o) => o.restaurantSlug === restaurantSlug).length;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (isSupabaseConfigured()) {
    const sb = await getServiceClient();
    const { data, error } = await sb.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
    if (error) throw new OrderError(`Could not load order: ${error.message}`, 500);
    return data ? rowToOrder(data as OrderRow) : undefined;
  }
  return fileReadAll().find((o) => o.id === id);
}

/** Restaurant-facing: every order for a restaurant, newest first. */
export async function listOrders(restaurantSlug: string): Promise<Order[]> {
  if (isSupabaseConfigured()) {
    const sb = await getServiceClient();
    const { data, error } = await sb
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_slug", restaurantSlug)
      .order("created_at", { ascending: false });
    if (error) throw new OrderError(`Could not list orders: ${error.message}`, 500);
    return ((data as OrderRow[] | null) ?? []).map(rowToOrder);
  }
  return fileReadAll()
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
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const sb = await getServiceClient();
    const { data, error } = await sb
      .from("orders")
      .update({ status, updated_at: now })
      .eq("id", id)
      .select(ORDER_SELECT)
      .maybeSingle();
    if (error) throw new OrderError(`Could not update order: ${error.message}`, 500);
    if (!data) throw new OrderError("Order not found.", 404);
    return rowToOrder(data as OrderRow);
  }
  const all = fileReadAll();
  const order = all.find((o) => o.id === id);
  if (!order) throw new OrderError("Order not found.", 404);
  order.status = status;
  order.updatedAt = now;
  fileWriteAll(all);
  return order;
}

/** Set an order's payment status (called by the Stripe webhook on success). */
export async function setPaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Order> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const sb = await getServiceClient();
    const { data, error } = await sb
      .from("orders")
      .update({ payment_status: paymentStatus, updated_at: now })
      .eq("id", id)
      .select(ORDER_SELECT)
      .maybeSingle();
    if (error) throw new OrderError(`Could not update payment: ${error.message}`, 500);
    if (!data) throw new OrderError("Order not found.", 404);
    return rowToOrder(data as OrderRow);
  }
  const all = fileReadAll();
  const order = all.find((o) => o.id === id);
  if (!order) throw new OrderError("Order not found.", 404);
  order.paymentStatus = paymentStatus;
  order.updatedAt = now;
  fileWriteAll(all);
  return order;
}

export { NEXT_STATUS };
