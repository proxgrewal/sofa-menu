import { NextRequest, NextResponse } from "next/server";
import { placeOrder, listOrders, OrderError } from "@/lib/orders";
import { parseOrderInput, ValidationError } from "@/lib/validate";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";
import { canAccess } from "@/lib/auth";

// Orders are file-backed; never statically cache these responses.
export const dynamic = "force-dynamic";

// POST /api/orders  -> place a guest order (records it against restaurant/table)
// Body: { restaurantSlug, tableLabel?, items: [{dishId, quantity}], note? }
export async function POST(req: NextRequest) {
  // Throttle order placement per IP to blunt spam/abuse (20 orders / minute).
  const rl = rateLimit(`order:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many orders. Please slow down." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const input = parseOrderInput(body);
    const order = await placeOrder(input);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("placeOrder failed", err);
    return NextResponse.json({ error: "Could not place order." }, { status: 500 });
  }
}

// GET /api/orders?restaurant={slug}  -> restaurant order visibility (owner-only)
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("restaurant");
  if (!slug) {
    return NextResponse.json({ error: "Missing ?restaurant={slug}." }, { status: 400 });
  }
  // Defense in depth: the middleware already scope-checks this route, but verify
  // the session can access this restaurant here too, so the handler is never
  // reliant on the matcher/middleware alone for cross-tenant isolation.
  const session = await getSession();
  if (!canAccess(session, slug)) {
    return NextResponse.json({ error: "Not authorized for this restaurant." }, { status: 403 });
  }
  return NextResponse.json({ orders: await listOrders(slug) });
}
