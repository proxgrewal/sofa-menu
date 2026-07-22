-- SOFA-13 — wire the app data layer to Postgres.
--
-- The app (lib/data.ts, lib/store.ts, lib/orders.ts) uses stable *text* ids
-- ("rest_pilot", "pcat_1", "pdish_1", "cat_ab12cd34", …) and a richer order
-- shape than the initial UUID schema (0001) modelled. The 0001 tables were
-- provisioned empty (SOFA-12), so we recreate the app tables with text primary
-- keys and an orders schema that mirrors lib/orders.ts exactly, letting the app
-- be the single source of truth for ids with no id translation layer.
--
-- The `dish-photos` storage bucket + policies (0002) are untouched.

drop table if exists order_items cascade;
drop table if exists orders cascade;
drop table if exists dishes cascade;
drop table if exists categories cascade;
drop table if exists menus cascade;
drop table if exists restaurants cascade;

create table restaurants (
  id         text primary key,
  slug       text not null unique,
  name       text not null,
  tagline    text not null default '',
  currency   char(3) not null default 'USD',
  updated_at timestamptz not null default now()
);

create table menus (
  id            text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  name          text not null
);

create table categories (
  id         text primary key,
  menu_id    text not null references menus(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0
);

create table dishes (
  id           text primary key,
  category_id  text not null references categories(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  price_cents  int  not null check (price_cents >= 0),
  photo_url    text,
  is_available boolean not null default true,
  sort_order   int  not null default 0
);

-- Orders mirror lib/orders.ts Order. Keyed to the restaurant by slug (the app's
-- natural key) with denormalised name snapshots so history survives menu edits.
create table orders (
  id              text primary key,
  ticket          text not null,
  restaurant_slug text not null,
  restaurant_name text not null,
  table_label     text not null default 'Takeaway',
  currency        char(3) not null default 'USD',
  subtotal_cents  int  not null default 0,
  tax_cents       int  not null default 0,
  total_cents     int  not null default 0,
  status          text not null default 'placed'
                    check (status in ('placed','in_progress','ready','completed','cancelled')),
  payment_status  text not null default 'deferred'
                    check (payment_status in ('unpaid','paid','deferred')),
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table order_items (
  id               bigint generated always as identity primary key,
  order_id         text not null references orders(id) on delete cascade,
  dish_id          text not null,
  name             text not null,
  unit_price_cents int  not null,
  quantity         int  not null check (quantity > 0),
  line_total_cents int  not null
);

create index idx_menus_restaurant on menus(restaurant_id);
create index idx_categories_menu on categories(menu_id);
create index idx_dishes_category on dishes(category_id);
create index idx_orders_slug on orders(restaurant_slug);
create index idx_order_items_order on order_items(order_id);
