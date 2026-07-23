// POST /api/webhooks/stripe -> Stripe payment lifecycle callbacks.
//
// Must be public and must read the RAW body (signature verification depends on
// the exact bytes). On `payment_intent.succeeded` we mark the referenced order
// paid. Any other event is acknowledged and ignored.
import { NextRequest, NextResponse } from "next/server";
import { parseWebhookEvent, isStripeConfigured } from "@/lib/payments";
import { setPaymentStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments not enabled." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await req.text();
  let event;
  try {
    event = await parseWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("stripe webhook verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded" && event.orderId) {
    try {
      await setPaymentStatus(event.orderId, "paid");
    } catch (err) {
      // Log but 200 the webhook so Stripe doesn't hammer retries for an order
      // we can't resolve; reconciliation is a manual/ops concern.
      console.error("failed to mark order paid", event.orderId, err);
    }
  }

  return NextResponse.json({ received: true });
}
