// ---------------------------------------------------------------------------
// Sales analytics for the owner dashboard.
//
// Pure and free of any next/* or persistence imports (like lib/orders' core) so
// it's trivially unit-testable and can run over orders from either backend.
// Cancelled orders are excluded from revenue; everything else counts as sold.
// ---------------------------------------------------------------------------

import type { Order } from "./orders";

export type TopItem = {
  dishId: string;
  name: string;
  quantity: number;
  revenueCents: number;
};

export type SalesSummary = {
  orderCount: number;
  itemsSold: number;
  grossRevenueCents: number;
  avgOrderValueCents: number;
  paidRevenueCents: number;
  ordersByStatus: Record<string, number>;
  topItems: TopItem[];
};

/** Summarise a restaurant's orders. `topN` caps the best-sellers list. */
export function summarizeOrders(orders: Order[], topN = 5): SalesSummary {
  const counted = orders.filter((o) => o.status !== "cancelled");

  let grossRevenueCents = 0;
  let paidRevenueCents = 0;
  let itemsSold = 0;
  const ordersByStatus: Record<string, number> = {};
  const items = new Map<string, TopItem>();

  for (const o of orders) ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;

  for (const o of counted) {
    grossRevenueCents += o.totalCents;
    if (o.paymentStatus === "paid") paidRevenueCents += o.totalCents;
    for (const l of o.lines) {
      itemsSold += l.quantity;
      const cur = items.get(l.dishId) ?? {
        dishId: l.dishId,
        name: l.name,
        quantity: 0,
        revenueCents: 0,
      };
      cur.quantity += l.quantity;
      cur.revenueCents += l.lineTotalCents;
      cur.name = l.name; // keep the latest snapshot name
      items.set(l.dishId, cur);
    }
  }

  const topItems = [...items.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenueCents - a.revenueCents)
    .slice(0, topN);

  return {
    orderCount: counted.length,
    itemsSold,
    grossRevenueCents,
    avgOrderValueCents: counted.length ? Math.round(grossRevenueCents / counted.length) : 0,
    paidRevenueCents,
    ordersByStatus,
    topItems,
  };
}
