import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/data";
import { listOrders } from "@/lib/orders";
import OrdersBoard from "./OrdersBoard";

// Restaurant-facing order visibility ("kitchen board"). Server-renders the
// current orders, then a client board keeps it live and lets staff advance
// each ticket. This is the restaurant half of the SOFA-6 DoD.
export const dynamic = "force-dynamic";

export default async function OrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const orders = await listOrders(slug);

  return (
    <main style={page}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{restaurant.name} — Orders</h1>
        <p style={{ color: "#666", margin: "4px 0 0" }}>
          Live guest orders. New tickets appear automatically.
        </p>
      </header>
      <OrdersBoard slug={slug} currency={restaurant.currency} initialOrders={orders} />
    </main>
  );
}

const page: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "24px 20px 48px",
  fontFamily: "system-ui, sans-serif",
};
