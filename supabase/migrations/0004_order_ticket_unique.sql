-- SOFA — guard against duplicate ticket numbers under concurrent order
-- placement. Tickets are assigned as `count(orders for restaurant) + 1`, so two
-- orders placed at the same instant can compute the same ticket. This unique
-- index makes the collision a hard DB error (23505) that lib/orders.ts catches
-- and retries with a bumped sequence, guaranteeing distinct tickets per
-- restaurant.

create unique index if not exists uq_orders_slug_ticket
  on orders (restaurant_slug, ticket);
