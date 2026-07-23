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
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isProtected(req: NextRequest): "page" | "api" | null {
  const { pathname } = req.nextUrl;

  // Admin UI pages — everything under /admin except the login route.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login") return null;
    return "page";
  }

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
  if (session) return NextResponse.next();

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
