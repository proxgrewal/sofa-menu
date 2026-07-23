# SOFA — Scan. Order. Feast. Anywhere.

QR-code digital menus for restaurants: a mobile-first guest menu, per-restaurant
QR codes, a restaurant admin for real-time menu/price/photo edits, and a guest
ordering flow. This repository is the SoftTech foundation all feature work
(SOFA-4…7) builds on.

## Stack

- **Web + API:** Next.js 15 (App Router, React 19, TypeScript) — one deployable
  app serving both the mobile UI and the API routes.
- **Database:** PostgreSQL via [Supabase](https://supabase.com) (schema in
  `supabase/migrations/`). The app also ships with an in-memory seed store
  (`lib/data.ts`) so it runs with zero infrastructure.
- **Image storage:** Supabase Storage bucket `dish-photos` for dish photos.
- **Payments:** Optional [Stripe](https://stripe.com) online prepayment
  (PaymentIntents + webhook). Off by default — orders are pay-at-table until the
  `STRIPE_*` env vars are set.
- **Hosting:** Vercel for the dynamic app; GitHub Pages for the static status
  page. CI/CD via GitHub Actions (typecheck, lint, format check, unit tests, build).

## Features

- Mobile-first guest menu + per-restaurant QR codes.
- Guest ordering with a live kitchen board (SSE), including **new-order
  sound + desktop alerts**.
- Owner **admin** for real-time menu/price/photo edits.
- **Owner authentication**, single- or **multi-tenant**: one `ADMIN_PASSWORD`
  superadmin, plus optional per-restaurant owner passwords (`SOFA_OWNERS`) that
  scope each owner to their own restaurant. See
  [docs/SOFA-16-admin-auth.md](docs/SOFA-16-admin-auth.md).
- **Sales analytics** per restaurant at `/admin/{slug}/analytics`.
- Hardening: request validation, per-IP rate limiting on login + ordering, an
  owner-only order-list endpoint, and unique ticket numbers under concurrency.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

The app runs immediately against seed data. To use the real database, copy
`.env.example` to `.env.local` and fill in the Supabase values.

Quality gates (all run in CI):

```bash
npm run lint          # ESLint (flat config)
npm run format        # Prettier --write  (format:check to verify)
npm test              # unit tests (Node's native runner, no build step)
npm run build         # Next.js production build
```

## Project layout

```
app/                 Next.js routes (pages + /api route handlers)
components/           React components
lib/                 data model, store, cart, orders, supabase client
supabase/migrations/ SQL schema + storage bucket setup
site/                static status page published to GitHub Pages
docs/                DEPLOY / DATABASE / ARCHITECTURE guides
.github/workflows/   CI (build) + Pages deploy
```

## Deploying changes

Push to `main`. See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the full pipeline,
required secrets, and how to provision Vercel + Supabase for the live app.
