// Server-only helper: read + verify the admin session inside Server Components
// and route handlers. Kept separate from lib/auth.ts so the Edge middleware
// (which imports lib/auth.ts) never pulls in `next/headers`.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./auth";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
