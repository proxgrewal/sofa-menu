"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCart,
  setQuantity,
  clearCart,
  CART_EVENT,
  type CartLine,
} from "@/lib/cart";

const TAX_RATE = 0.0825; // display estimate; server is authoritative

export default function CartClient({
  slug,
  restaurantName,
  currency,
}: {
  slug: string;
  restaurantName: string;
  currency: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [table, setTable] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setLines(getCart(slug));
    sync();
    // Prefill table from the QR deep-link (?table=12) if present.
    const t = new URLSearchParams(window.location.search).get("table");
    if (t) setTable(t);
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, [slug]);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      cents / 100
    );

  const subtotal = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  async function placeOrder() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: slug,
          tableLabel: table,
          note,
          items: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place order.");
      clearCart(slug);
      router.push(`/r/${slug}/order/${data.order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <main style={page}>
        <h1 style={h1}>Your cart</h1>
        <p style={{ color: "#666" }}>Your cart is empty.</p>
        <Link href={`/r/${slug}`} style={backLink}>
          ← Back to menu
        </Link>
      </main>
    );
  }

  return (
    <main style={page}>
      <Link href={`/r/${slug}`} style={backLink}>
        ← {restaurantName} menu
      </Link>
      <h1 style={h1}>Your cart</h1>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px" }}>
        {lines.map((l) => (
          <li key={l.dishId} style={row}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{l.name}</div>
              <div style={{ color: "#666", fontSize: 14 }}>
                {fmt(l.unitPriceCents)} each
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                style={stepper}
                aria-label={`Remove one ${l.name}`}
                onClick={() => setQuantity(slug, l.dishId, l.quantity - 1)}
              >
                −
              </button>
              <span style={{ minWidth: 16, textAlign: "center" }}>
                {l.quantity}
              </span>
              <button
                type="button"
                style={stepper}
                aria-label={`Add one ${l.name}`}
                onClick={() => setQuantity(slug, l.dishId, l.quantity + 1)}
              >
                +
              </button>
            </div>
            <div style={{ width: 84, textAlign: "right", fontWeight: 600 }}>
              {fmt(l.unitPriceCents * l.quantity)}
            </div>
          </li>
        ))}
      </ul>

      <label style={label}>
        Table
        <input
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="e.g. 12"
          style={input}
        />
      </label>
      <label style={label}>
        Note for the kitchen (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Allergies, no onions, etc."
          rows={2}
          style={{ ...input, resize: "vertical" }}
        />
      </label>

      <dl style={totals}>
        <div style={totalRow}>
          <dt>Subtotal</dt>
          <dd>{fmt(subtotal)}</dd>
        </div>
        <div style={totalRow}>
          <dt>Tax</dt>
          <dd>{fmt(tax)}</dd>
        </div>
        <div style={{ ...totalRow, fontWeight: 700, fontSize: 18 }}>
          <dt>Total</dt>
          <dd>{fmt(total)}</dd>
        </div>
      </dl>

      <p style={{ color: "#888", fontSize: 13, margin: "4px 0 16px" }}>
        Payment is handled at the table — no card needed to place your order.
      </p>

      {error && (
        <p role="alert" style={{ color: "#b00020", marginBottom: 12 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={placeOrder}
        disabled={submitting}
        style={{ ...placeBtn, opacity: submitting ? 0.6 : 1 }}
      >
        {submitting ? "Placing order…" : `Place order · ${fmt(total)}`}
      </button>
    </main>
  );
}

const page: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "24px 20px 48px",
  fontFamily: "system-ui, sans-serif",
};
const h1: React.CSSProperties = { fontSize: 26, margin: "12px 0 20px" };
const backLink: React.CSSProperties = {
  color: "#666",
  textDecoration: "none",
  fontSize: 14,
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 0",
  borderBottom: "1px solid #eee",
};
const stepper: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "1px solid #1a1a1a",
  background: "#fff",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};
const label: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
};
const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 16,
  fontWeight: 400,
};
const totals: React.CSSProperties = { margin: "8px 0 0" };
const totalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
};
const placeBtn: React.CSSProperties = {
  width: "100%",
  padding: "16px",
  borderRadius: 14,
  border: "none",
  background: "#1a1a1a",
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
  cursor: "pointer",
};
