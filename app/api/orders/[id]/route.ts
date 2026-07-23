import { NextRequest, NextResponse } from "next/server";
import { getOrder, updateOrderStatus, OrderError, type OrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

const VALID_STATUSES: OrderStatus[] = ["placed", "in_progress", "ready", "completed", "cancelled"];

// GET /api/orders/{id} -> single order (guest confirmation polling)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  return NextResponse.json({ order });
}

// PATCH /api/orders/{id} -> restaurant advances/cancels the order
// Body: { status: OrderStatus }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.status || !VALID_STATUSES.includes(body.status as OrderStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  try {
    const order = await updateOrderStatus(id, body.status as OrderStatus);
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
