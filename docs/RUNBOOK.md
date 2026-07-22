# Restaurant Onboarding Runbook

_Owner: Founding Engineer · Product: SOFA (Scan · Order · Fast) · Last updated: 2026-07-22_

How to take one restaurant from "paper menu" to a live, scannable digital menu
with guest ordering. Target time: **~20 minutes** for a small menu.

---

## 0. Prerequisites

- Node.js ≥ 18 (repo built/tested on Node 26).
- Repo checked out, dependencies installed:
  ```bash
  npm install
  ```
- The public base URL the QR codes should point at. In production this is set
  by the deploy pipeline via `NEXT_PUBLIC_BASE_URL` (e.g. `https://menu.sofa.app`).
  For local onboarding/testing, `http://localhost:3000` is the default.

---

## 1. Load the restaurant's menu

The menu source of truth is the seed in **`lib/data.ts`** (`RESTAURANTS`). Each
restaurant is: `slug`, `name`, `tagline`, `currency`, and a `menu` of
`categories -> dishes`. Prices are stored in **minor units (cents)** to avoid
float rounding — `495` means `$4.95`.

Two ways to load a menu:

1. **Seed (bulk import, recommended for first load).** Add a `Restaurant`
   object to `RESTAURANTS` in `lib/data.ts`. Use a stable, URL-safe `slug`
   (lowercase, hyphens). This is how the pilot (`pilot-diner`) was loaded.
2. **Admin UI (day-to-day edits).** Once the restaurant exists, categories,
   dishes, prices, photos, and availability (86'ing an item) are edited live in
   the admin at `/admin/{slug}` — changes push to guest menus in real time (SSE),
   no reprint or redeploy.

Checklist when entering a menu:
- [ ] Every dish has a name and a price in cents.
- [ ] Descriptions are short (one line reads best on mobile).
- [ ] Photo URLs are https and reachable (allowed host configured in
      `next.config.mjs` — currently `images.unsplash.com`; add the operator's
      CDN host there before using their own photos).
- [ ] Categories are ordered the way the kitchen wants them to read.

> **Pilot note:** the pilot restaurant `pilot-diner` ("The Pilot Diner") is
> loaded with a **real, publicly published menu** (burgers, fries, shakes,
> drinks) with real US prices, sourced from publicly reported In-N-Out menu
> pricing (2025–2026). This is representative data an operator confirms during
> onboarding; swap exact prices with the signed pilot partner before go-live.

---

## 2. Generate the QR code

Each restaurant gets a unique QR that resolves to its guest menu at `/r/{slug}`.

- **In-app:** `GET /r/{slug}/qr` returns a 512px PNG (`image/png`) encoding
  `NEXT_PUBLIC_BASE_URL + /r/{slug}`.
- **Script (for printing):** generate a file to hand to the printer:
  ```bash
  NEXT_PUBLIC_BASE_URL="https://menu.sofa.app" node scripts/gen-qr.js pilot-diner
  # -> public/qr/pilot-diner.png  and  public/qr/pilot-diner.svg
  ```

Checklist:
- [ ] Scan the generated code with a real phone camera — it must open the menu.
- [ ] Print at ≥ 3 cm; keep the quiet-zone margin; test on the actual table
      material (matte laminate scans best).

---

## 3. Validate the end-to-end flow (scan → menu → order)

Run the automated end-to-end check against a running server:

```bash
npm run build && npm start &   # or: npm run dev
BASE_URL=http://localhost:3000 SLUG=pilot-diner bash scripts/demo-e2e.sh
```

The script exercises the full guest path against the **real pilot menu**:
1. `GET /r/{slug}` — guest menu landing page loads (200).
2. `GET /api/restaurants/{slug}/menu` — menu JSON has categories + dishes.
3. `POST /api/orders` — place an order for real dishes; expect `201` + a ticket
   number + a correct computed total (subtotal + tax).
4. `GET /api/orders?restaurant={slug}` — the order is visible to the restaurant.

Then do the **manual phone pass** (this is the recorded demo):
- [ ] Scan the printed QR on a phone → menu opens.
- [ ] Add items to the cart, adjust quantities, place the order.
- [ ] Confirmation shows the ticket number and total.
- [ ] Order appears on the restaurant/kitchen side.
- [ ] Edit a price in `/admin/{slug}` → guest menu updates without reload.

Record a 30–60s screen capture of the phone doing the above → this is the
**Definition of Done** artifact for the pilot.

---

## 4. Go-live

- [ ] Set `NEXT_PUBLIC_BASE_URL` to the production domain and deploy.
- [ ] Regenerate + reprint the QR against the production URL (step 2).
- [ ] Place the QR on tables / at the counter.
- [ ] Give the operator the `/admin/{slug}` link and a 5-minute walkthrough of
      editing prices and 86'ing items.

---

## 5. Rollback / support

- **Wrong price live:** fix it in `/admin/{slug}` — it propagates instantly. No
  redeploy needed.
- **Menu won't load:** confirm the deploy is up and `NEXT_PUBLIC_BASE_URL`
  matches the QR's encoded URL (a mismatch is the #1 cause of a dead QR).
- **Photo broken:** the host must be allow-listed in `next.config.mjs`.
- **Bad/duplicate order:** orders are advanced/cancelled via the order status
  API (`PATCH /api/orders/{id}`) from the restaurant side.

---

## Appendix: onboarding time budget

| Step | Task | Time |
|------|------|------|
| 1 | Enter menu (seed or admin) | 10–15 min |
| 2 | Generate + test QR | 2 min |
| 3 | Run e2e + phone pass | 5 min |
| 4 | Deploy + place QR | 3 min |

Total: **~20–25 min** for a small menu.
