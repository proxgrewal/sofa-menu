# SOFA-16 — Owner admin authentication

The restaurant admin (SOFA-5) lets an owner change prices, add/edit/delete
products, toggle availability and upload photos — and every guest sees it live.
Until now that panel was **completely open**: anyone who reached `/admin` could
edit any restaurant's menu. SOFA-16 puts the owner in control by gating admin
behind a login.

## What shipped

| Piece                                                            | Path                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Edge/Node-safe session auth (HMAC-signed cookie, password check) | `lib/auth.ts`                                        |
| Route gate: redirect pages, 401 mutating APIs                    | `middleware.ts`                                      |
| Login / logout endpoints                                         | `app/api/admin/session/route.ts`                     |
| Owner login screen                                               | `app/admin/login/page.tsx`                           |
| "Sign out" control on the admin home                             | `components/LogoutButton.tsx` + `app/admin/page.tsx` |
| Config keys                                                      | `.env.example`                                       |

## What is protected

- **Every `/admin/**` page** except `/admin/login` → unauthenticated visitors
  are redirected to the login screen (`?next=` bounces them back after sign-in).
- **Every menu-mutating API** — `POST/PUT/PATCH/DELETE` under
  `/api/restaurants/**` (categories, dishes, reorder) and `/api/upload` (photos)
  → unauthenticated calls get a JSON **401**.

Left public on purpose (the guest experience is zero-friction):

- Guest pages `/m/**`, `/r/**`, the QR pages.
- **GET** menu / stream / read APIs (guests read the live menu).
- Guest ordering (`/api/orders/**`) — placing/reading orders needs no login.

## How auth works

1. Owner enters the password on `/admin/login`.
2. `POST /api/admin/session` verifies it and sets an **HttpOnly, SameSite=Lax,
   signed** cookie (`sofa_admin`). The token is `base64url(payload).HMAC` where
   the payload carries `{ sub: "owner", exp }`; it is signed with
   `ADMIN_SESSION_SECRET` using Web Crypto (`crypto.subtle`), so the _same_
   verify runs in the Edge middleware and in Node API routes.
3. `middleware.ts` verifies the cookie on every protected request. Expired or
   tampered tokens fail verification and are treated as logged-out.
4. `DELETE /api/admin/session` (the "Sign out" button) clears the cookie.

Sessions are **stateless** — no DB table, no server session store — which keeps
this a thin, deploy-anywhere slice consistent with the rest of the app.

## Configuration

Runs out of the box with insecure **dev defaults** (password `sofa-admin`) so
local dev needs no setup. **Always set both of these in any shared/prod deploy:**

```bash
ADMIN_PASSWORD=<the owner's password>
ADMIN_SESSION_SECRET=<long random string, e.g. `openssl rand -hex 32`>
ADMIN_SESSION_TTL_H=12   # optional, session lifetime in hours (default 12)
```

`lib/auth.ts` exposes `usingInsecureDefaults()` for a future startup/health
warning when these are unset.

## Verified end-to-end (dev server)

- Unauthenticated `GET /admin` → **307** redirect to `/admin/login?next=/admin`. ✓
- Unauthenticated `POST /api/restaurants/olive-grove/categories` → **401**. ✓
- Guest `GET /api/restaurants/olive-grove/menu` → **200** (still public). ✓
- Wrong password → **401**; correct password → **200** + `sofa_admin` cookie. ✓
- Authenticated create category → **201**; authenticated `GET /admin` → **200**. ✓
- After sign-out (`DELETE /api/admin/session`), mutation again → **401**. ✓
- `npm run build` passes; middleware compiles to the Edge runtime. ✓

## Follow-ups (not blocking)

- **Per-restaurant owners.** Today it's one shared owner password for the whole
  install. A `owners`/`restaurant_members` table keyed by `restaurant_id` would
  scope each owner to their own restaurant (natural next issue).
- **Order status APIs** (`PATCH /api/orders/[id]`) are staff actions but remain
  open to keep guest ordering untouched; fold into staff auth when roles land.
- Rate-limit / lockout on the login endpoint.
