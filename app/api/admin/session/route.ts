// SOFA-16 — owner login / logout endpoints.
//
//   POST /api/admin/session   { password }  -> sets the signed session cookie
//   DELETE /api/admin/session               -> clears it (logout)
//
// These routes are intentionally NOT behind the auth middleware (POST here is
// how you obtain a session in the first place — see middleware.ts, which only
// guards /api/restaurants/** and /api/upload).
import { checkPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { password } = await readJson<{ password?: string }>(req);
  if (!checkPassword(password ?? "")) {
    // Uniform delay-free 401; message is deliberately vague.
    return json({ error: "Incorrect password." }, 401);
  }
  const { token, maxAgeSec } = await createSession();
  const res = json({ ok: true });
  res.headers.append(
    "set-cookie",
    cookie(SESSION_COOKIE, token, {
      maxAge: maxAgeSec,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: isProd(),
    }),
  );
  return res;
}

export async function DELETE() {
  const res = json({ ok: true });
  res.headers.append(
    "set-cookie",
    cookie(SESSION_COOKIE, "", { maxAge: 0, httpOnly: true, sameSite: "Lax", path: "/", secure: isProd() }),
  );
  return res;
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

type CookieOpts = {
  maxAge: number;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  secure?: boolean;
};

function cookie(name: string, value: string, opts: CookieOpts): string {
  const parts = [`${name}=${value}`, `Path=${opts.path ?? "/"}`, `Max-Age=${opts.maxAge}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
