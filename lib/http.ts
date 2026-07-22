// Small helpers shared by the SOFA-5 admin API route handlers.
import { StoreError } from "./store";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Wrap a handler so StoreError -> proper status and anything else -> 500.
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StoreError) return json({ error: err.message }, err.status);
    console.error("[api] unhandled", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
