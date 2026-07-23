"use client";

import { useEffect, useState } from "react";
import { addToCart, setQuantity, getCart, CART_EVENT } from "@/lib/cart";

/**
 * Drop-in "Add" control for a dish card on the guest menu. Self-contained: the
 * SOFA-4 menu page just renders <AddToCartButton slug dish /> per dish. Shows
 * the current quantity in the cart so the guest gets immediate feedback.
 */
export default function AddToCartButton({
  slug,
  dish,
}: {
  slug: string;
  dish: { id: string; name: string; priceCents: number };
}) {
  const [qty, setQty] = useState(0);

  useEffect(() => {
    const sync = () => setQty(getCart(slug).find((l) => l.dishId === dish.id)?.quantity ?? 0);
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, [slug, dish.id]);

  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={() => addToCart(slug, dish)}
        aria-label={`Add ${dish.name} to cart`}
        style={btn}
      >
        Add
      </button>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => setQuantity(slug, dish.id, qty - 1)}
        aria-label={`Remove one ${dish.name}`}
        style={stepper}
      >
        −
      </button>
      <span aria-live="polite" style={{ minWidth: 16, textAlign: "center" }}>
        {qty}
      </span>
      <button
        type="button"
        onClick={() => addToCart(slug, dish)}
        aria-label={`Add one ${dish.name}`}
        style={stepper}
      >
        +
      </button>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 999,
  border: "1px solid #1a1a1a",
  background: "#1a1a1a",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const stepper: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "1px solid #1a1a1a",
  background: "#fff",
  color: "#1a1a1a",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};
