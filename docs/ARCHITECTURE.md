# Architecture

```
        ┌──────────────────────── Vercel ────────────────────────┐
 guest  │  Next.js app                                            │
 phone ─┼─▶  app/            (mobile menu UI, admin UI)           │
  (QR)  │    app/api/*       (route handlers: menu, orders, admin)│
        │      │                                                  │
        │      ├─ lib/data.ts / lib/store.ts  (in-memory seed)    │
        │      └─ lib/supabase.ts ──▶ Supabase Postgres + Storage │
        └────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │  Supabase                                   │
                    │   • Postgres  (restaurants→menus→…→dishes,  │
                    │                orders)                      │
                    │   • Storage   (dish-photos bucket, public)  │
                    └─────────────────────────────────────────────┘
```

## Principles

- **One deployable app.** Web UI and API live in the same Next.js project, so a
  single push deploys both.
- **Zero-infra default.** `lib/data.ts` / `lib/store.ts` provide an in-memory
  seed store; the app runs and demos with no database. `lib/supabase.ts` is the
  drop-in production data/storage layer, activated by env vars.
- **Prices in cents.** All money is stored as integer minor units to avoid
  floating-point rounding.
- **Photos in object storage.** Dish photos live in the `dish-photos` Supabase
  bucket (public read, server-side writes with the service-role key), not in
  the repo or the database.

## Data model

`restaurants → menus → categories → dishes`, plus `orders → order_items`. Full
DDL in `supabase/migrations/0001_init.sql`; storage in `0002_storage.sql`.
