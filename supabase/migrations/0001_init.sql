-- SOFA — initial schema
-- Relational model mirroring lib/data.ts: restaurant -> menu -> category -> dish,
-- plus guest orders. Prices are stored in minor units (cents) to avoid float
-- rounding. Photo URLs point at objects in the `dish-photos` storage bucket
-- (see 0002_storage.sql).

create extension if not exists "pgcrypto";

create table if not exists restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text not null default '',
  currency    char(3) not null default 'USD',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists menus (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  name           text not null,
  created_at     timestamptz not null default now()
);

create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references menus(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0
);

create table if not exists dishes (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  price_cents  int  not null check (price_cents >= 0),
  -- Public URL (or storage path) of the dish photo in the dish-photos bucket.
  photo_url    text,
  sort_order   int  not null default 0,
  is_available boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  table_label    text,
  status         text not null default 'placed'
                   check (status in ('placed','preparing','served','cancelled')),
  total_cents    int  not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  dish_id     uuid not null references dishes(id),
  name        text not null,           -- denormalised snapshot at order time
  price_cents int  not null,
  quantity    int  not null check (quantity > 0)
);

create index if not exists idx_menus_restaurant on menus(restaurant_id);
create index if not exists idx_categories_menu on categories(menu_id);
create index if not exists idx_dishes_category on dishes(category_id);
create index if not exists idx_orders_restaurant on orders(restaurant_id);
create index if not exists idx_order_items_order on order_items(order_id);
