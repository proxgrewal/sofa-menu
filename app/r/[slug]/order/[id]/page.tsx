import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { formatPrice } from "@/lib/data";
import OrderStatusLive from "./OrderStatusLive";

// Guest-facing order confirmation. Server-rendered snapshot + live status poll.
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const order = getOrder(id);
  if (!order || order.restaurantSlug !== slug) notFound();

  const fmt = (c: number) => formatPrice(c, order.currency);

  return (
    <main style={page}>
      <div style={badge}>✓</div>
      <h1 style={h1}>Order placed</h1>
      <p style={{ color: "#666", marginTop: 4 }}>
        Thanks! {order.restaurantName} has your order for{" "}
        <strong>{order.tableLabel}</strong>.
      </p>

      <div style={ticketBox}>
        <span style={{ color: "#666", fontSize: 13 }}>Ticket</span>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1 }}>
          {order.ticket}
        </span>
      </div>

      <OrderStatusLive orderId={order.id} initialStatus={order.status} />

      <ul style={{ listStyle: "none", padding: 0, margin: "20px 0" }}>
        {order.lines.map((l) => (
          <li key={l.dishId} style={row}>
            <span>
              {l.quantity}× {l.name}
            </span>
            <span>{fmt(l.lineTotalCents)}</span>
          </li>
        ))}
      </ul>

      <dl style={{ margin: 0 }}>
        <div style={totalRow}>
          <dt>Subtotal</dt>
          <dd>{fmt(order.subtotalCents)}</dd>
        </div>
        <div style={totalRow}>
          <dt>Tax</dt>
          <dd>{fmt(order.taxCents)}</dd>
        </div>
        <div style={{ ...totalRow, fontWeight: 700, fontSize: 18 }}>
          <dt>Total</dt>
          <dd>{fmt(order.totalCents)}</dd>
        </div>
      </dl>

      {order.note && (
        <p style={{ color: "#666", marginTop: 16 }}>
          <strong>Note:</strong> {order.note}
        </p>
      )}

      <p style={{ color: "#888", fontSize: 13, marginTop: 20 }}>
        Payment status: <strong>{order.paymentStatus}</strong> — settle at the
        table.
      </p>

      <Link href={`/r/${slug}`} style={backLink}>
        ← Back to menu
      </Link>
    </main>
  );
}

const page: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "40px 20px 48px",
  fontFamily: "system-ui, sans-serif",
  textAlign: "center",
};
const badge: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 999,
  background: "#1a7f37",
  color: "#fff",
  fontSize: 30,
  lineHeight: "56px",
  margin: "0 auto 12px",
};
const h1: React.CSSProperties = { fontSize: 26, margin: 0 };
const ticketBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  margin: "24px 0",
  padding: "16px",
  border: "2px dashed #ccc",
  borderRadius: 14,
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid #eee",
  textAlign: "left",
};
const totalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
  textAlign: "left",
};
const backLink: React.CSSProperties = {
  display: "inline-block",
  marginTop: 28,
  color: "#666",
  textDecoration: "none",
};
