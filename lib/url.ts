import { headers } from "next/headers";

/**
 * Resolve the public origin of the deployment so generated QR codes point at a
 * scannable absolute URL. Prefers an explicit env override (set this in prod),
 * then falls back to the inbound request's Host header.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function menuPath(slug: string): string {
  return `/r/${slug}`;
}
