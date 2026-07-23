import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllRestaurants, getRestaurantBySlug, formatPrice } from "@/lib/data";
import AddToCartButton from "@/components/AddToCartButton";
import CartBar from "@/components/CartBar";

// Pre-render every seeded restaurant's menu at build time.
export function generateStaticParams() {
  return getAllRestaurants().map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = getRestaurantBySlug(slug);
  if (!restaurant) return { title: "Menu not found" };
  return {
    title: `${restaurant.name} — Menu`,
    description: restaurant.tagline,
  };
}

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const { menu, currency } = restaurant;

  return (
    <main className="shell">
      <header className="menu-header">
        <h1>{restaurant.name}</h1>
        <p className="tagline">{restaurant.tagline}</p>
        <span className="menu-name">{menu.name}</span>
      </header>

      {menu.categories.map((category) => (
        <section className="category" key={category.id}>
          <h2>{category.name}</h2>
          {category.dishes.map((dish) => (
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
                <p className="desc">{dish.description}</p>
                <div className="dish-actions">
                  <AddToCartButton
                    slug={restaurant.slug}
                    dish={{
                      id: dish.id,
                      name: dish.name,
                      priceCents: dish.priceCents,
                    }}
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}

      <p className="footer">Powered by SOFA · Scan. Order. Feast. Anywhere.</p>
      <CartBar slug={restaurant.slug} currency={currency} />
    </main>
  );
}
