// SOFA-16 — gate the restaurant admin behind owner authentication.
//
// Protected:
//   * every `/admin/**` page except the login page itself
//   * every *mutating* menu API (POST/PATCH/PUT/DELETE under
//     `/api/restaurants/**`) and the photo upload endpoint (`/api/upload`)
//
// Left public (the guest experience must keep working with zero friction):
//   * `/m/**`, `/r/**` guest pages, the QR pages
//   * GET menu / stream / restaurant reads
//   * guest ordering (`/api/orders/**`)
//
// Unauthenticated *page* requests are redirected to `/admin/login?next=…`;
// unauthenticated *API* requests get a JSON 401 (no redirect, so fetch()s in
// the admin UI fail loudly instead of silently following a redirect to HTML).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, canAccess } from "@/lib/auth";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Extract the restaurant slug a request targets, so we can scope-check it.
 * `/admin/{slug}` and `/api/restaurants/{slug}/…` carry it in the path;
 * `/api/orders` carries it in the `?restaurant=` query. The admin index and
 * upload endpoint don't target one restaurant (any authenticated owner may
 * reach those). Returns "" for `/api/orders` with no slug so the caller can
 * reject it rather than treating a missing slug as "unscoped / allow". */
function targetSlug(req: NextRequest): string | null {
  const { pathname, searchParams } = req.nextUrl;
  let m = pathname.match(/^\/admin\/([^/]+)/);
  if (m && m[1] !== "login") return m[1];
  m = pathname.match(/^\/api\/restaurants\/([^/]+)/);
  if (m) return m[1];
  if (pathname === "/api/orders") return searchParams.get("restaurant") ?? "";
  return null;
}

function isProtected(req: NextRequest): "page" | "api" | null {
  const { pathname } = req.nextUrl;

  // Admin UI pages — everything under /admin except the login route.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login") return null;
    return "page";
  }

  // Order listing exposes every guest's order for a restaurant (tables, notes,
  // totals) — owner-only. The single-order GET (`/api/orders/{id}`) stays public
  // so a guest can poll their own confirmation by its unguessable id.
  if (req.method === "GET" && pathname === "/api/orders") return "api";

  // Menu-editing APIs: only the mutating verbs. GETs stay public so guests can
  // read the live menu / SSE stream.
  if (MUTATING.has(req.method)) {
    if (pathname === "/api/upload") return "api";
    if (pathname.startsWith("/api/restaurants/")) return "api";
  }

  return null;
}

export async function middleware(req: NextRequest) {
  const kind = isProtected(req);
  if (!kind) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (session) {
    // Authenticated — now enforce the session's scope against the target
    // restaurant. A per-restaurant owner may not touch another's menu.
    //   null -> route isn't restaurant-scoped (admin index, upload): allow.
    //   ""   -> scoped route missing its slug (e.g. /api/orders with no
    //           ?restaurant=): reject rather than fall through as "unscoped".
    const slug = targetSlug(req);
    if (slug === null) return NextResponse.next();
    if (slug === "") {
      return NextResponse.json({ error: "Missing restaurant." }, { status: 400 });
    }
    if (canAccess(session, slug)) return NextResponse.next();

    if (kind === "api") {
      return NextResponse.json({ error: "Not authorized for this restaurant." }, { status: 403 });
    }
    // Bounce a scoped owner to their own restaurant rather than showing a 403.
    const url = req.nextUrl.clone();
    url.pathname = session.scope === "all" ? "/admin" : `/admin/${session.scope}`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (kind === "api") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on admin pages and the API surface; skip static assets.
  matcher: ["/admin/:path*", "/api/:path*"],
};
