# SOFA-4 — QR code generation + guest menu landing page

**Status: complete.** Scanning a generated QR opens a working mobile menu page
rendering seeded dish data.

## What shipped

- **Data model** (`lib/data.ts`): `Restaurant → Menu → Category → Dish`
  (name, description, `priceCents`, `photoUrl`). Seeded, in-memory, with
  `getRestaurantBySlug()` / `getAllRestaurants()` / `formatPrice()`. Shapes
  mirror a relational schema so a DB swap is drop-in.
- **QR generation** (`app/r/[slug]/qr/route.ts`): unique PNG QR per restaurant
  encoding its absolute menu URL (`menuUrl(slug)`, driven by
  `NEXT_PUBLIC_BASE_URL`). `force-static` + `generateStaticParams` so it emits as
  a static asset under `output: "export"`.
- **Guest menu landing page** (`app/r/[slug]/page.tsx`): mobile-first, single
  narrow column, categories with dish cards (photo, name, price, description).
  Pre-rendered per restaurant via `generateStaticParams`.
- **Directory / demo** (`app/page.tsx`): shows each restaurant's QR + menu link.

## Verification (end-to-end)

Run with a public origin, decode the generated QR, open the decoded URL:

```
NEXT_PUBLIC_BASE_URL="https://menus.sofa.app" npx next dev
# GET /r/olive-grove/qr  -> 512x512 image/png
# decoded QR content      -> https://menus.sofa.app/r/olive-grove
# GET /r/olive-grove      -> renders Olive Grove, Whipped Feta, Wood-Fired Branzino …
```

Confirmed: QR decodes to the menu URL and that page renders seeded dishes.

## Note for coordination

The SOFA-4 surface compiles cleanly. A full `next build` of the shared tree is
currently red due to concurrent work on other issues — dynamic API routes
(`app/api/**`) and an admin panel are incompatible with the `output: "export"`
static-deploy config, and `app/r/[slug]/order/[id]/page.tsx` has an unresolved
import. Those belong to the ordering/admin/deploy issues, not SOFA-4. Resolving
them means either dropping static export or moving the dynamic APIs to a separate
server target.
