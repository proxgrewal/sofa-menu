"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartCount, cartSubtotalCents, CART_EVENT } from "@/lib/cart";

/**
 * Sticky "View cart · N items · $X" bar the guest menu shows at the bottom of
 * the screen. Hidden when the cart is empty. Links to the cart/checkout page.
 */
export default function CartBar({ slug, currency }: { slug: string; currency: string }) {
  const [count, setCount] = useState(0);
  const [subtotal, setSubtotal] = useState(0);

  useEffect(() => {
    const sync = () => {
      setCount(cartCount(slug));
      setSubtotal(cartSubtotalCents(slug));
    };
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, [slug]);

  if (count === 0) return null;

  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(subtotal / 100);

  return (
    <div style={wrap}>
      <Link href={`/r/${slug}/cart`} style={link}>
        <span>
          View cart · {count} item{count === 1 ? "" : "s"}
        </span>
        <span>{price}</span>
      </Link>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  padding: 16,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};

const link: React.CSSProperties = {
  pointerEvents: "auto",
  width: "100%",
  maxWidth: 640,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 20px",
  borderRadius: 14,
  background: "#1a1a1a",
  color: "#fff",
  fontWeight: 600,
  textDecoration: "none",
  boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
};
