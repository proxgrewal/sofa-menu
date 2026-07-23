# SOFA-5 — Restaurant admin: real-time menu, price & photo editing

Non-technical restaurant staff edit their menu and guests see it update **live**,
with no reprint and no redeploy.

## What shipped

| Piece                                                  | Path                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Mutable, persisted menu store + in-process SSE pub/sub | `lib/store.ts`                                                   |
| API error/JSON helpers                                 | `lib/http.ts`                                                    |
| Guest menu API                                         | `app/api/restaurants/[slug]/menu/route.ts`                       |
| **Live** menu stream (SSE)                             | `app/api/restaurants/[slug]/stream/route.ts`                     |
| Category CRUD + reorder                                | `app/api/restaurants/[slug]/categories/**`                       |
| Dish create / update / delete / reorder                | `app/api/restaurants/[slug]/**/dishes/**`, `.../dishes/[dishId]` |
| Photo upload                                           | `app/api/upload/route.ts` → writes `public/uploads`, returns URL |
| Admin home (pick a restaurant)                         | `app/admin/page.tsx`                                             |
| Admin editor (the core UI)                             | `app/admin/[slug]/page.tsx` + `components/AdminBoard.tsx`        |
| Real-time guest menu                                   | `app/m/[slug]/page.tsx` + `components/LiveMenu.tsx`              |
| Shared SSE hook                                        | `lib/useMenuStream.ts`                                           |
| Styles                                                 | `components/sofa5.css` (reuses tokens from `app/globals.css`)    |

## How real-time works

The admin UI POST/PATCHes the API → `lib/store.ts` mutates state, persists to
`data/menu-state.json`, and `emit()`s the full restaurant to every SSE
subscriber for that slug. The guest menu (`/m/[slug]`) holds an `EventSource`
and re-renders on each frame. Unavailable ("86'd") dishes are hidden from guests
but stay visible/greyed in admin. State + subscribers live on `globalThis` so
Next HMR / route reloads don't drop live menus or connections.

## Admin capabilities (DoD)

- Create / rename / delete / reorder categories.
- Create / edit / delete / reorder dishes (name, description, price, availability).
- Move a dish between categories (reorder endpoint accepts cross-category moves).
- Upload / replace / remove a dish photo.
- Price is edited in dollars, stored in integer cents (no float drift).

## Verified end-to-end (dev server)

- Edit dish price in admin API → guest menu API + SSE both reflect it. ✓
- SSE stream delivered `snapshot` then `dish.updated` with the new price on a
  concurrent edit (the DoD: guest sees it immediately). ✓
- Availability toggle, category+dish create, photo upload (201 + URL),
  static photo served `200 image/png`. ✓
- Admin & guest pages render `200`. ✓

## Run

```bash
npm install
npm run dev
# Admin:  http://localhost:3000/admin
# Guest:  http://localhost:3000/m/olive-grove   (open in a second tab and watch it update live)
```

## Handoff note for SOFA-4 (QR + guest landing)

SOFA-4's `app/r/[slug]/page.tsx` renders a **static** snapshot from the
read-only `lib/data.ts` seed, so it won't live-update. To meet the whole-product
promise, point the QR code at **`/m/[slug]`** (the real-time page), or swap the
body of `/r/[slug]` to render `<LiveMenu slug={slug} initial={...} />`. Tracked
under SOFA-4; not blocking SOFA-5's DoD.
