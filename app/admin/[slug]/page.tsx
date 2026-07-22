import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRestaurant } from "@/lib/store";
import AdminBoard from "@/components/AdminBoard";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getRestaurant(slug);
  return { title: r ? `${r.name} — Admin` : "Admin" };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await getRestaurant(slug);
  if (!r) notFound();
  return <AdminBoard slug={slug} initial={r} />;
}
