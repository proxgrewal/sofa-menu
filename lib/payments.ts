// ---------------------------------------------------------------------------
// Payments (Stripe) — the real integration behind the stub in lib/orders.ts.
//
// Consistent with SOFA's zero-infra philosophy, Stripe is OPTIONAL and loaded
// dynamically. With no keys set, orders stay `paymentStatus: "deferred"`
// (pay-at-table / pay-on-pickup) exactly as before. Set the STRIPE_* env vars to
// enable online prepayment:
//
//   flow:  guest places order (deferred)
//       -> POST /api/orders/{id}/pay  creates a PaymentIntent, returns clientSecret
//       -> guest confirms card client-side with the publishable key
//       -> Stripe calls POST /api/webhooks/stripe -> we mark the order "paid"
//
// `stripe` is imported dynamically (indirect specifier) so the app typechecks
// and builds without the package installed — same trick as lib/supabase.ts.
// ---------------------------------------------------------------------------

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** True when online payments are configured. */
export function isStripeConfigured(): boolean {
  return Boolean(secretKey);
}

async function stripeClient(): Promise<any> {
  if (!secretKey) throw new Error("Stripe not configured");
  const spec = ["stripe"].join("");
  const mod: any = await import(/* webpackIgnore: true */ spec);
  const Stripe = mod.default ?? mod;
  return new Stripe(secretKey, { apiVersion: "2024-06-20" });
}

export type PaymentIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
};

/**
 * Create (or return) a PaymentIntent for an order amount. The order id is
 * stamped into metadata so the webhook can resolve which order to mark paid.
 */
export async function createPaymentIntent(args: {
  orderId: string;
  amountCents: number;
  currency: string;
}): Promise<PaymentIntentResult> {
  const stripe = await stripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: args.amountCents,
    currency: args.currency.toLowerCase(),
    metadata: { orderId: args.orderId },
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

export type StripeWebhookEvent = {
  type: string;
  orderId: string | null;
};

/**
 * Verify a raw webhook payload against the signing secret and extract the bits
 * SOFA cares about. Throws if the signature is invalid (caller returns 400).
 */
export async function parseWebhookEvent(
  rawBody: string,
  signature: string
): Promise<StripeWebhookEvent> {
  if (!webhookSecret) throw new Error("Stripe webhook secret not configured");
  const stripe = await stripeClient();
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  const orderId = event?.data?.object?.metadata?.orderId ?? null;
  return { type: event.type, orderId };
}
