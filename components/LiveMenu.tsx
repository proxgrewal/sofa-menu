"use client";

import "./sofa5.css";
import { useMenuStream, formatPrice } from "@/lib/useMenuStream";
import type { StoredRestaurant } from "@/lib/store";

// Real-time guest menu. Subscribes to the SSE stream so admin edits (price,
// photo, availability, new dishes, reordering) appear here with no refresh.
export default function LiveMenu({
  slug,
  initial,
}: {
  slug: string;
  initial?: StoredRestaurant | null;
}) {
  const { restaurant, connected } = useMenuStream(slug, initial ?? null);

  if (!restaurant) {
    return (
      <main className="shell live-menu">
        <p className="loading">Loading menu…</p>
      </main>
    );
  }

  const { menu, currency } = restaurant;

  return (
    <main className="shell live-menu">
      <header className="menu-header">
        <h1>{restaurant.name}</h1>
        <p className="tagline">{restaurant.tagline}</p>
        <span className="menu-name">{menu.name}</span>
        <span
          className={`live-dot ${connected ? "on" : "off"}`}
          title={connected ? "Live" : "Reconnecting…"}
        >
          {connected ? "● Live" : "○ Reconnecting"}
        </span>
      </header>

      {menu.categories.map((category) => {
        const dishes = category.dishes.filter((d) => d.available);
        if (dishes.length === 0) return null;
        return (
          <section className="category" key={category.id}>
            <h2>{category.name}</h2>
            {dishes.map((dish) => (
              <article className="dish" key={dish.id}>
                {dish.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="photo" src={dish.photoUrl} alt={dish.name} />
                ) : (
                  <div className="photo placeholder" aria-hidden="true">
                    🍽
                  </div>
                )}
                <div className="body">
                  <div className="row">
                    <p className="name">{dish.name}</p>
                    <span className="price">{formatPrice(dish.priceCents, currency)}</span>
                  </div>
                  {dish.description && <p className="desc">{dish.description}</p>}
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </main>
  );
}
