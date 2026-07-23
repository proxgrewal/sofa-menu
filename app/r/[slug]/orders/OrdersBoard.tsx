"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Play a short "new order" chime via the Web Audio API (no asset needed).
function chime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio not available */
  }
}

type Line = { dishId: string; name: string; quantity: number; lineTotalCents: number };
type Order = {
  id: string;
  ticket: string;
  tableLabel: string;
  currency: string;
  lines: Line[];
  totalCents: number;
  status: string;
  paymentStatus: string;
  note: string;
  createdAt: string;
};

const NEXT: Record<string, string | null> = {
  placed: "in_progress",
  in_progress: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};
const NEXT_LABEL: Record<string, string> = {
  placed: "Start preparing",
  in_progress: "Mark ready",
  ready: "Mark delivered",
};
const STATUS_LABEL: Record<string, string> = {
  placed: "New",
  in_progress: "Preparing",
  ready: "Ready",
  completed: "Delivered",
  cancelled: "Cancelled",
};

export default function OrdersBoard({
  slug,
  currency,
  initialOrders,
}: {
  slug: string;
  currency: string;
  initialOrders: Order[];
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [busy, setBusy] = useState<string | null>(null);
  const [alertsOn, setAlertsOn] = useState(false);
  // Ids we've already seen, so a poll can detect genuinely new tickets.
  const seen = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));

  const fmt = (c: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(c / 100);

  const notify = useCallback(
    (newOrders: Order[]) => {
      chime();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const first = newOrders[0];
        const title =
          newOrders.length === 1 ? `New order ${first.ticket}` : `${newOrders.length} new orders`;
        const amount = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          (first?.totalCents ?? 0) / 100
        );
        new Notification(title, {
          body: first ? `${first.tableLabel} · ${amount}` : "",
        });
      }
    },
    [currency]
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?restaurant=${slug}`, { cache: "no-store" });
      if (!res.ok) return;
      const { orders } = (await res.json()) as { orders: Order[] };
      // Detect new, still-active tickets since the last poll.
      const fresh = orders.filter(
        (o) => !seen.current.has(o.id) && o.status !== "completed" && o.status !== "cancelled"
      );
      orders.forEach((o) => seen.current.add(o.id));
      if (fresh.length > 0 && alertsOn) notify(fresh);
      setOrders(orders);
    } catch {
      /* transient */
    }
  }, [slug, alertsOn, notify]);

  useEffect(() => {
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function enableAlerts() {
    setAlertsOn(true);
    chime(); // also unlocks audio under the user gesture
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* denied */
      }
    }
  }

  async function advance(order: Order, status: string) {
    setBusy(order.id);
    try {
      await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
  const closed = orders.filter((o) => o.status === "completed" || o.status === "cancelled");

  const alertBar = (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      {alertsOn ? (
        <span style={{ fontSize: 13, color: "#1a7f37", fontWeight: 600 }}>
          🔔 New-order alerts on
        </span>
      ) : (
        <button type="button" onClick={enableAlerts} style={ghostBtn}>
          🔔 Enable new-order alerts
        </button>
      )}
    </div>
  );

  if (orders.length === 0) {
    return (
      <>
        {alertBar}
        <p style={{ color: "#666" }}>No orders yet. They’ll appear here live.</p>
      </>
    );
  }

  const card = (o: Order) => {
    const next = NEXT[o.status];
    return (
      <li key={o.id} style={cardStyle}>
        <div style={cardHeader}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{o.ticket}</span>
          <span style={statusPill(o.status)}>{STATUS_LABEL[o.status]}</span>
        </div>
        <div style={{ color: "#666", fontSize: 14, marginBottom: 8 }}>
          {o.tableLabel} ·{" "}
          {new Date(o.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px" }}>
          {o.lines.map((l) => (
            <li key={l.dishId} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                {l.quantity}× {l.name}
              </span>
              <span style={{ color: "#666" }}>{fmt(l.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        {o.note && <div style={noteStyle}>📝 {o.note}</div>}
        <div style={cardFooter}>
          <span style={{ fontWeight: 700 }}>{fmt(o.totalCents)}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {o.status !== "completed" && o.status !== "cancelled" && (
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => advance(o, "cancelled")}
                style={ghostBtn}
              >
                Cancel
              </button>
            )}
            {next && (
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => advance(o, next)}
                style={primaryBtn}
              >
                {NEXT_LABEL[o.status]}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      {alertBar}
      <ul style={grid}>{active.map(card)}</ul>
      {closed.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, color: "#666", marginTop: 32 }}>Recently closed</h2>
          <ul style={{ ...grid, opacity: 0.6 }}>{closed.slice(0, 6).map(card)}</ul>
        </>
      )}
    </>
  );
}

const grid: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
};
const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
};
const cardFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid #eee",
};
const noteStyle: React.CSSProperties = {
  background: "#fff8e1",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  marginBottom: 8,
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "#1a1a1a",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#666",
  cursor: "pointer",
};
function statusPill(status: string): React.CSSProperties {
  const colors: Record<string, [string, string]> = {
    placed: ["#e7f0ff", "#0b5cad"],
    in_progress: ["#fff4e0", "#a15c00"],
    ready: ["#eef6ee", "#1a7f37"],
    completed: ["#eee", "#555"],
    cancelled: ["#fbe9e9", "#b00020"],
  };
  const [bg, fg] = colors[status] ?? ["#eee", "#555"];
  return {
    background: bg,
    color: fg,
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  };
}
