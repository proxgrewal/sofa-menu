import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import "@/components/sofa5.css";
import { getRestaurant } from "@/lib/store";
import { listOrders } from "@/lib/orders";
import { summarizeOrders } from "@/lib/analytics";
import { formatPrice } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getRestaurant(slug);
  return { title: r ? `${r.name} — Analytics` : "Analytics" };
}

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRestaurant(slug);
  if (!r) notFound();

  const orders = await listOrders(slug);
  const s = summarizeOrders(orders);
  const money = (c: number) => formatPrice(c, r.currency);

  const stats: [string, string][] = [
    ["Orders", String(s.orderCount)],
    ["Gross revenue", money(s.grossRevenueCents)],
    ["Avg order", money(s.avgOrderValueCents)],
    ["Items sold", String(s.itemsSold)],
    ["Paid online", money(s.paidRevenueCents)],
  ];

  return (
    <main className="shell" style={{ maxWidth: 860 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
      >
        <h1 style={{ margin: 0 }}>{r.name} — Analytics</h1>
        <Link className="btn ghost" href={`/admin/${slug}`}>
          ← Back to menu
        </Link>
      </div>
      <p className="tagline">Sales across all orders (cancelled orders excluded from revenue).</p>

      <section style={statGrid}>
        {stats.map(([label, value]) => (
          <div key={label} style={statCard}>
            <div style={{ fontSize: 13, color: "#666" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </section>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Best sellers</h2>
      {s.topItems.length === 0 ? (
        <p style={{ color: "#666" }}>No sales yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666", fontSize: 13 }}>
              <th style={th}>Item</th>
              <th style={{ ...th, textAlign: "right" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {s.topItems.map((it) => (
              <tr key={it.dishId} style={{ borderTop: "1px solid #eee" }}>
                <td style={td}>{it.name}</td>
                <td style={{ ...td, textAlign: "right" }}>{it.quantity}</td>
                <td style={{ ...td, textAlign: "right" }}>{money(it.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Orders by status</h2>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(s.ordersByStatus).map(([status, count]) => (
          <li key={status} style={statusChip}>
            <strong>{count}</strong> {status.replace("_", " ")}
          </li>
        ))}
      </ul>
    </main>
  );
}

const statGrid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  marginTop: 16,
};
const statCard: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};
const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 6px" };
const statusChip: React.CSSProperties = {
  background: "#f3f4f6",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 14,
};
