"use client";

import { useEffect, useState } from "react";

const LABELS: Record<string, string> = {
  placed: "Sent to the kitchen",
  in_progress: "Being prepared",
  ready: "Ready — on its way",
  completed: "Delivered — enjoy!",
  cancelled: "Cancelled",
};

// Polls the order every few seconds so the guest sees the kitchen advance it.
export default function OrderStatusLive({
  orderId,
  initialStatus,
}: {
  orderId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) return;
        const { order } = await res.json();
        if (alive && order?.status) setStatus(order.status);
      } catch {
        /* transient; retry on next tick */
      }
    };
    const timer = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderId]);

  const done = status === "completed" || status === "cancelled";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 999,
        background: status === "cancelled" ? "#fbe9e9" : "#eef6ee",
        color: status === "cancelled" ? "#b00020" : "#1a7f37",
        fontWeight: 600,
      }}
    >
      {!done && <span className="pulse" style={dot} aria-hidden />}
      <span aria-live="polite">{LABELS[status] ?? status}</span>
    </div>
  );
}

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "currentColor",
  display: "inline-block",
};
