import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/data";
import CartClient from "./CartClient";

// Cart review + place-order page for a guest at a table.
export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  return (
    <CartClient
      slug={restaurant.slug}
      restaurantName={restaurant.name}
      currency={restaurant.currency}
    />
  );
}
