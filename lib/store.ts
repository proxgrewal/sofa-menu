// ---------------------------------------------------------------------------
// Mutable menu store + real-time pub/sub (SOFA-5, SOFA-13).
//
// lib/data.ts is a read-only seed. This module promotes it to a mutable,
// persisted source of truth and adds an in-process event bus so admin edits
// push to guest menus over SSE with no reprint / redeploy.
//
// Persistence (SOFA-13): when Supabase is configured (isSupabaseConfigured()),
// menus live in Postgres, read/written via the service-role client. This is
// what survives Vercel's ephemeral filesystem across redeploys. When it is NOT
// configured (local dev with zero infra), we fall back to the original
// JSON-file-backed seed store so the app still runs with no external services.
//
// The app's stable text ids ("pcat_1", "dish_ab12cd34", …) are the primary
// keys in Postgres too (migration 0003), so there is no id translation layer.
//
// The subscriber bus stays in-process (globalThis) — SSE clients connected to a
// given server instance get pushed the full restaurant on every mutation.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAllRestaurants, type Restaurant, type Category, type Dish } from "./data";
import { getServiceClient, isSupabaseConfigured } from "./supabase";

// A dish in the mutable store gains an `available` flag (86'd items stay
// visible on admin but are greyed out / hidden on the guest menu).
export type StoredDish = Dish & { available: boolean };
export type StoredCategory = Omit<Category, "dishes"> & { dishes: StoredDish[] };
export type StoredMenu = { id: string; name: string; categories: StoredCategory[] };
export type StoredRestaurant = Omit<Restaurant, "menu"> & { menu: StoredMenu };

type Subscriber = (event: string, restaurant: StoredRestaurant) => void;

type StoreGlobal = {
  bySlug: Map<string, StoredRestaurant>;
  subs: Map<string, Set<Subscriber>>;
  loaded: boolean;
};

const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "menu-state.json");

const g = globalThis as unknown as { __sofaStore?: StoreGlobal };
if (!g.__sofaStore) {
  g.__sofaStore = { bySlug: new Map(), subs: new Map(), loaded: false };
}
const store = g.__sofaStore;

function seedFromData(): Map<string, StoredRestaurant> {
  const map = new Map<string, StoredRestaurant>();
  for (const r of getAllRestaurants()) {
    map.set(r.slug, {
      ...r,
      menu: {
        ...r.menu,
        categories: r.menu.categories.map((c) => ({
          ...c,
          dishes: c.dishes.map((d) => ({ ...d, available: true })),
        })),
      },
    });
  }
  return map;
}

// --- Postgres persistence (SOFA-13) ----------------------------------------

/** Hydrate the in-memory cache from Postgres, seeding it on first run. */
async function loadFromDb(): Promise<void> {
  const sb = await getServiceClient();
  const { data, error } = await sb
    .from("restaurants")
    .select(
      "id, slug, name, tagline, currency, " +
        "menus ( id, name, categories ( id, name, sort_order, " +
        "dishes ( id, name, description, price_cents, photo_url, is_available, sort_order ) ) )"
    );
  if (error) throw new StoreError(500, `db read failed: ${error.message}`);

  if (!data || data.length === 0) {
    // Empty DB: seed it from lib/data.ts so the pilot menu exists in Postgres.
    store.bySlug = seedFromData();
    for (const r of store.bySlug.values()) await saveToDb(r);
    return;
  }

  const map = new Map<string, StoredRestaurant>();
  for (const row of data as DbRestaurantRow[]) {
    const menu = row.menus?.[0];
    map.set(row.slug, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline ?? "",
      currency: row.currency,
      menu: {
        id: menu?.id ?? `menu_${row.slug}`,
        name: menu?.name ?? "Menu",
        categories: (menu?.categories ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((c) => ({
            id: c.id,
            name: c.name,
            dishes: (c.dishes ?? [])
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((d) => ({
                id: d.id,
                name: d.name,
                description: d.description ?? "",
                priceCents: d.price_cents,
                photoUrl: d.photo_url,
                available: d.is_available,
              })),
          })),
      },
    });
  }
  store.bySlug = map;
}

type DbDishRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  is_available: boolean;
  sort_order: number;
};
type DbCategoryRow = { id: string; name: string; sort_order: number; dishes: DbDishRow[] | null };
type DbMenuRow = { id: string; name: string; categories: DbCategoryRow[] | null };
type DbRestaurantRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  currency: string;
  menus: DbMenuRow[] | null;
};

/**
 * Persist a restaurant's full menu to Postgres by replacing its category/dish
 * rows. A whole-menu replace (rather than granular ops) keeps the DB an exact
 * mirror of the in-memory state for every mutation; cheap at pilot scale.
 */
async function saveToDb(r: StoredRestaurant): Promise<void> {
  const sb = await getServiceClient();

  const up = async (table: string, rows: unknown[]) => {
    if (rows.length === 0) return;
    const { error } = await sb.from(table).upsert(rows);
    if (error) throw new StoreError(500, `db write (${table}) failed: ${error.message}`);
  };

  await up("restaurants", [
    { id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, currency: r.currency },
  ]);
  await up("menus", [{ id: r.menu.id, restaurant_id: r.id, name: r.menu.name }]);

  // Delete categories no longer present (cascades to their dishes), then upsert
  // the current set. Dishes of surviving categories are replaced per-category.
  const catIds = r.menu.categories.map((c) => c.id);
  const delCats = sb.from("categories").delete().eq("menu_id", r.menu.id);
  const { error: delCatErr } = await (catIds.length
    ? delCats.not("id", "in", `(${catIds.join(",")})`)
    : delCats);
  if (delCatErr) throw new StoreError(500, `db prune categories failed: ${delCatErr.message}`);

  await up(
    "categories",
    r.menu.categories.map((c, i) => ({
      id: c.id,
      menu_id: r.menu.id,
      name: c.name,
      sort_order: i,
    }))
  );

  for (const c of r.menu.categories) {
    const dishIds = c.dishes.map((d) => d.id);
    const delDishes = sb.from("dishes").delete().eq("category_id", c.id);
    const { error: delDishErr } = await (dishIds.length
      ? delDishes.not("id", "in", `(${dishIds.join(",")})`)
      : delDishes);
    if (delDishErr) throw new StoreError(500, `db prune dishes failed: ${delDishErr.message}`);

    await up(
      "dishes",
      c.dishes.map((d, i) => ({
        id: d.id,
        category_id: c.id,
        name: d.name,
        description: d.description,
        price_cents: d.priceCents,
        photo_url: d.photoUrl,
        is_available: d.available,
        sort_order: i,
      }))
    );
  }
}

// --- JSON-file fallback (no Supabase configured) ---------------------------

function loadFromFile(): void {
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    const arr = JSON.parse(raw) as StoredRestaurant[];
    store.bySlug = new Map(arr.map((r) => [r.slug, r]));
  } catch {
    store.bySlug = seedFromData();
    persistToFile();
  }
}

function persistToFile(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify([...store.bySlug.values()], null, 2));
  } catch (err) {
    console.error("[store] persist failed", err);
  }
}

// --- Load / persist dispatch -----------------------------------------------

/** Ensure the in-memory cache reflects the backing store before a read/mutate.
 * With Postgres configured we re-read every time so reads stay fresh across
 * server instances; with the file fallback we load once. */
async function ensureLoaded(): Promise<void> {
  if (isSupabaseConfigured()) {
    await loadFromDb();
    store.loaded = true;
    return;
  }
  if (store.loaded) return;
  loadFromFile();
  store.loaded = true;
}

async function persist(r: StoredRestaurant): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveToDb(r);
  } else {
    persistToFile();
  }
}

/** Persist a mutation and push the new state to any subscribed SSE clients. */
async function commit(event: string, r: StoredRestaurant): Promise<void> {
  await persist(r);
  const set = store.subs.get(r.slug);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event, r);
    } catch (err) {
      console.error("[store] subscriber threw", err);
    }
  }
}

// --- Reads ------------------------------------------------------------------

export async function getRestaurant(slug: string): Promise<StoredRestaurant | undefined> {
  await ensureLoaded();
  return store.bySlug.get(slug);
}

export async function listRestaurants(): Promise<StoredRestaurant[]> {
  await ensureLoaded();
  return [...store.bySlug.values()];
}

// --- Subscriptions (SSE) ----------------------------------------------------

export function subscribe(slug: string, fn: Subscriber): () => void {
  let set = store.subs.get(slug);
  if (!set) {
    set = new Set();
    store.subs.set(slug, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

// --- Helpers ----------------------------------------------------------------

async function mustRestaurant(slug: string): Promise<StoredRestaurant> {
  const r = await getRestaurant(slug);
  if (!r) throw new StoreError(404, `restaurant '${slug}' not found`);
  return r;
}

function findCategory(r: StoredRestaurant, categoryId: string): StoredCategory {
  const c = r.menu.categories.find((c) => c.id === categoryId);
  if (!c) throw new StoreError(404, `category '${categoryId}' not found`);
  return c;
}

export class StoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// --- Category mutations -----------------------------------------------------

export async function createCategory(slug: string, name: string): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  const clean = (name ?? "").trim();
  if (!clean) throw new StoreError(400, "category name is required");
  r.menu.categories.push({ id: `cat_${randomUUID().slice(0, 8)}`, name: clean, dishes: [] });
  await commit("category.created", r);
  return r;
}

export async function updateCategory(
  slug: string,
  categoryId: string,
  name: string
): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  const c = findCategory(r, categoryId);
  const clean = (name ?? "").trim();
  if (!clean) throw new StoreError(400, "category name is required");
  c.name = clean;
  await commit("category.updated", r);
  return r;
}

export async function deleteCategory(slug: string, categoryId: string): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  const before = r.menu.categories.length;
  r.menu.categories = r.menu.categories.filter((c) => c.id !== categoryId);
  if (r.menu.categories.length === before) throw new StoreError(404, "category not found");
  await commit("category.deleted", r);
  return r;
}

export async function reorderCategories(
  slug: string,
  orderedIds: string[]
): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  r.menu.categories = applyOrder(r.menu.categories, orderedIds);
  await commit("category.reordered", r);
  return r;
}

// --- Dish mutations ---------------------------------------------------------

export type DishInput = {
  name?: string;
  description?: string;
  priceCents?: number;
  photoUrl?: string | null;
  available?: boolean;
};

export async function createDish(
  slug: string,
  categoryId: string,
  input: DishInput
): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  const c = findCategory(r, categoryId);
  const name = (input.name ?? "").trim();
  if (!name) throw new StoreError(400, "dish name is required");
  c.dishes.push({
    id: `dish_${randomUUID().slice(0, 8)}`,
    name,
    description: (input.description ?? "").trim(),
    priceCents: normalizePrice(input.priceCents),
    photoUrl: input.photoUrl ?? null,
    available: input.available ?? true,
  });
  await commit("dish.created", r);
  return r;
}

export async function updateDish(
  slug: string,
  dishId: string,
  input: DishInput
): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  const dish = findDish(r, dishId);
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new StoreError(400, "dish name cannot be empty");
    dish.name = name;
  }
  if (input.description !== undefined) dish.description = input.description.trim();
  if (input.priceCents !== undefined) dish.priceCents = normalizePrice(input.priceCents);
  if (input.photoUrl !== undefined) dish.photoUrl = input.photoUrl;
  if (input.available !== undefined) dish.available = !!input.available;
  await commit("dish.updated", r);
  return r;
}

export async function deleteDish(slug: string, dishId: string): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  let removed = false;
  for (const c of r.menu.categories) {
    const before = c.dishes.length;
    c.dishes = c.dishes.filter((d) => d.id !== dishId);
    if (c.dishes.length !== before) removed = true;
  }
  if (!removed) throw new StoreError(404, "dish not found");
  await commit("dish.deleted", r);
  return r;
}

// Reorder dishes within a category, and/or move a dish to another category.
export async function reorderDishes(
  slug: string,
  categoryId: string,
  orderedIds: string[]
): Promise<StoredRestaurant> {
  const r = await mustRestaurant(slug);
  const target = findCategory(r, categoryId);
  // Pull any listed dishes out of every category first (supports cross-category moves).
  const pulled = new Map<string, StoredDish>();
  for (const c of r.menu.categories) {
    c.dishes = c.dishes.filter((d) => {
      if (orderedIds.includes(d.id)) {
        pulled.set(d.id, d);
        return false;
      }
      return true;
    });
  }
  target.dishes = orderedIds
    .map((id) => pulled.get(id))
    .filter((d): d is StoredDish => !!d);
  await commit("dish.reordered", r);
  return r;
}

// --- internals --------------------------------------------------------------

function findDish(r: StoredRestaurant, dishId: string): StoredDish {
  for (const c of r.menu.categories) {
    const d = c.dishes.find((d) => d.id === dishId);
    if (d) return d;
  }
  throw new StoreError(404, `dish '${dishId}' not found`);
}

function normalizePrice(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new StoreError(400, "price must be a non-negative number of cents");
  return Math.round(n);
}

function applyOrder<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((i): i is T => !!i);
  // Append anything not mentioned in orderedIds so nothing silently disappears.
  const seen = new Set(orderedIds);
  for (const i of items) if (!seen.has(i.id)) ordered.push(i);
  return ordered;
}
