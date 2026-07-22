import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRestaurant } from "@/lib/store";
import LiveMenu from "@/components/LiveMenu";

// Real-time guest menu (SOFA-5). This is the page a QR code should point at:
// it renders the current server state and then live-updates over SSE, so a
// price/photo edit in admin shows here immediately with no reprint / redeploy.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = getRestaurant(slug);
  if (!r) return { title: "Menu not found" };
  return { title: `${r.name} — Menu`, description: r.tagline };
}

export default async function LiveMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = getRestaurant(slug);
  if (!r) notFound();
  return <LiveMenu slug={slug} initial={r} />;
}
