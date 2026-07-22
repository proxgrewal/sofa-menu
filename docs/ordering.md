# Guest ordering flow (SOFA-6)

Lets a guest at a table build a cart from the QR menu and place an order the
restaurant can see — no staff needed. Payments are deferred (pay-at-table) with
a clearly marked integration seam.

## The loop

1. **Menu** `/r/{slug}` — each dish has an `Add` control (`AddToCartButton`).
   A sticky `CartBar` shows item count + subtotal and links to the cart.
2. **Cart** `/r/{slug}/cart` — review lines, adjust quantities, set table + note,
   place the order.
3. **Confirmation** `/r/{slug}/order/{id}` — ticket number, itemised totals, and
   a live status pill that polls as the kitchen advances the order.
4. **Restaurant board** `/r/{slug}/orders` — live tickets; staff advance each
   through `placed → in_progress → ready → completed` (or cancel).

The cart lives client-side in `localStorage` (`lib/cart.ts`), scoped per
restaurant slug. Orders are priced and validated **server-side** against the
live menu (`lib/orders.ts`) so the client can't dictate prices.

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST   | `/api/orders` | Place an order. Body: `{ restaurantSlug, tableLabel?, items:[{dishId,quantity}], note? }` → `201 { order }` |
| GET    | `/api/orders?restaurant={slug}` | Restaurant order list, newest first |
| GET    | `/api/orders/{id}` | Single order (guest confirmation polling) |
| PATCH  | `/api/orders/{id}` | Advance/cancel. Body: `{ status }` |

Prices are integer cents; tax is a flat `TAX_RATE` in `lib/orders.ts`. Orders
persist to `data/orders.json` (atomic write) so they survive across requests.
Swapping that file store for a real DB is a drop-in change behind the exported
functions.

## Payments — integration point (stubbed)

Payments are intentionally deferred for the pilot. The single seam is
`capturePayment(amountCents, currency)` in `lib/orders.ts`, which currently
returns `{ status: "deferred" }` (every order is `paymentStatus: "deferred"` =
settle at the table).

To integrate Stripe: create a PaymentIntent for the order total at placement,
confirm it client-side on the cart page, and flip `paymentStatus` to `"paid"`
on the webhook. No other part of the flow needs to change.

## Verifying

```bash
# Pure order-core unit tests (no build step, uses Node TS type-stripping):
node --import ./test/ts-resolve.mjs --test test/smoke.test.ts

# Full HTTP loop:
npx next dev
# then POST /api/orders, GET /api/orders?restaurant=olive-grove, etc.
```

## Follow-ups / notes

- Guest menu (`/r/{slug}`) prices from the static seed `lib/data.ts`; the admin
  live-edit store is `lib/store.ts`. If admin edits should reprice guest carts,
  point `priceCart` at the store layer. Consistent today because both the menu
  page and pricing read the seed.
- Auth for the restaurant orders board is out of scope here (SOFA-5 admin owns
  restaurant identity); the board is currently open per slug.
