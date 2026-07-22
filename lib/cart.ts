"use client";

// ---------------------------------------------------------------------------
// Client-side cart (SOFA-6). Lives in localStorage, scoped per restaurant slug
// so scanning a second restaurant's QR never mixes carts. Emits a window event
// on every mutation so badges/menus re-render without a state framework.
// ---------------------------------------------------------------------------

export type CartLine = {
  dishId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
};

const KEY_PREFIX = "sofa.cart.";
export const CART_EVENT = "sofa:cart-changed";

function key(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

function emit(slug: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { slug } }));
  }
}

export function getCart(slug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(slug: string, lines: CartLine[]): void {
  window.localStorage.setItem(key(slug), JSON.stringify(lines));
  emit(slug);
}

export function addToCart(
  slug: string,
  dish: { id: string; name: string; priceCents: number },
  quantity = 1
): void {
  const lines = getCart(slug);
  const existing = lines.find((l) => l.dishId === dish.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    lines.push({
      dishId: dish.id,
      name: dish.name,
      unitPriceCents: dish.priceCents,
      quantity,
    });
  }
  save(slug, lines);
}

export function setQuantity(slug: string, dishId: string, quantity: number): void {
  let lines = getCart(slug);
  if (quantity <= 0) {
    lines = lines.filter((l) => l.dishId !== dishId);
  } else {
    const line = lines.find((l) => l.dishId === dishId);
    if (line) line.quantity = quantity;
  }
  save(slug, lines);
}

export function removeFromCart(slug: string, dishId: string): void {
  save(
    slug,
    getCart(slug).filter((l) => l.dishId !== dishId)
  );
}

export function clearCart(slug: string): void {
  save(slug, []);
}

export function cartCount(slug: string): number {
  return getCart(slug).reduce((n, l) => n + l.quantity, 0);
}

export function cartSubtotalCents(slug: string): number {
  return getCart(slug).reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
}
