import { NextRequest, NextResponse } from "next/server";
import { placeOrder, listOrders, OrderError } from "@/lib/orders";

// Orders are file-backed; never statically cache these responses.
export const dynamic = "force-dynamic";

// POST /api/orders  -> place a guest order (records it against restaurant/table)
// Body: { restaurantSlug, tableLabel?, items: [{dishId, quantity}], note? }
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const order = placeOrder(body as Parameters<typeof placeOrder>[0]);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("placeOrder failed", err);
    return NextResponse.json({ error: "Could not place order." }, { status: 500 });
  }
}

// GET /api/orders?restaurant={slug}  -> restaurant order visibility
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("restaurant");
  if (!slug) {
    return NextResponse.json(
      { error: "Missing ?restaurant={slug}." },
      { status: 400 }
    );
  }
  return NextResponse.json({ orders: listOrders(slug) });
}
