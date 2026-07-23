// POST /api/orders/{id}/pay -> create a Stripe PaymentIntent for an order and
// return its clientSecret for client-side confirmation. Public (the guest who
// placed the order pays it); the order id is unguessable.
//
// Returns 501 when Stripe is not configured so the guest UI can fall back to
// pay-at-table cleanly.
import { NextRequest, NextResponse } from "next/server";
import { getOrder, OrderError } from "@/lib/orders";
import { isStripeConfigured, createPaymentIntent } from "@/lib/payments";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Online payment is not enabled." }, { status: 501 });
  }

  const rl = rateLimit(`pay:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  const { id } = await params;
  try {
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ error: "Order is already paid." }, { status: 409 });
    }
    const intent = await createPaymentIntent({
      orderId: order.id,
      amountCents: order.totalCents,
      currency: order.currency,
    });
    return NextResponse.json({ clientSecret: intent.clientSecret });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("createPaymentIntent failed", err);
    return NextResponse.json({ error: "Could not start payment." }, { status: 500 });
  }
}
