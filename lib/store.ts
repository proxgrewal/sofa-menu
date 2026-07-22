// ---------------------------------------------------------------------------
// Mutable menu store + real-time pub/sub (SOFA-5).
//
// lib/data.ts is a read-only seed. This module promotes it to a mutable,
// persisted source of truth and adds an in-process event bus so admin edits
// push to guest menus over SSE with no reprint / redeploy.
//
// Persistence: a single JSON file under data/. In-process only — fine for the
// Next dev server (single process) and the pilot. Swapping the file for a real
// DB later is a drop-in change behind these functions.
//
// State + subscribers are stashed on globalThis so Next.js HMR / route-handler
// module reloads don't reset live menus or drop SSE subscribers.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAllRestaurants, type Restaurant, type Category, type Dish } from "./data";

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

function load(): void {
  if (store.loaded) return;
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    const arr = JSON.parse(raw) as StoredRestaurant[];
    store.bySlug = new Map(arr.map((r) => [r.slug, r]));
  } catch {
    store.bySlug = seedFromData();
    persist();
  }
  store.loaded = true;
}

function persist(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify([...store.bySlug.values()], null, 2));
  } catch (err) {
    console.error("[store] persist failed", err);
  }
}

function emit(event: string, r: StoredRestaurant): void {
  persist();
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

export function getRestaurant(slug: string): StoredRestaurant | undefined {
  load();
  return store.bySlug.get(slug);
}

export function listRestaurants(): StoredRestaurant[] {
  load();
  return [...store.bySlug.values()];
}

// --- Subscriptions (SSE) ----------------------------------------------------

export function subscribe(slug: string, fn: Subscriber): () => void {
  load();
  let set = store.subs.get(slug);
  if (!set) {
    set = new Set();
    store.subs.set(slug, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

// --- Helpers ----------------------------------------------------------------

function mustRestaurant(slug: string): StoredRestaurant {
  const r = getRestaurant(slug);
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

export function createCategory(slug: string, name: string): StoredRestaurant {
  const r = mustRestaurant(slug);
  const clean = (name ?? "").trim();
  if (!clean) throw new StoreError(400, "category name is required");
  r.menu.categories.push({ id: `cat_${randomUUID().slice(0, 8)}`, name: clean, dishes: [] });
  emit("category.created", r);
  return r;
}

export function updateCategory(slug: string, categoryId: string, name: string): StoredRestaurant {
  const r = mustRestaurant(slug);
  const c = findCategory(r, categoryId);
  const clean = (name ?? "").trim();
  if (!clean) throw new StoreError(400, "category name is required");
  c.name = clean;
  emit("category.updated", r);
  return r;
}

export function deleteCategory(slug: string, categoryId: string): StoredRestaurant {
  const r = mustRestaurant(slug);
  const before = r.menu.categories.length;
  r.menu.categories = r.menu.categories.filter((c) => c.id !== categoryId);
  if (r.menu.categories.length === before) throw new StoreError(404, "category not found");
  emit("category.deleted", r);
  return r;
}

export function reorderCategories(slug: string, orderedIds: string[]): StoredRestaurant {
  const r = mustRestaurant(slug);
  r.menu.categories = applyOrder(r.menu.categories, orderedIds);
  emit("category.reordered", r);
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

export function createDish(slug: string, categoryId: string, input: DishInput): StoredRestaurant {
  const r = mustRestaurant(slug);
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
  emit("dish.created", r);
  return r;
}

export function updateDish(
  slug: string,
  dishId: string,
  input: DishInput
): StoredRestaurant {
  const r = mustRestaurant(slug);
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
  emit("dish.updated", r);
  return r;
}

export function deleteDish(slug: string, dishId: string): StoredRestaurant {
  const r = mustRestaurant(slug);
  let removed = false;
  for (const c of r.menu.categories) {
    const before = c.dishes.length;
    c.dishes = c.dishes.filter((d) => d.id !== dishId);
    if (c.dishes.length !== before) removed = true;
  }
  if (!removed) throw new StoreError(404, "dish not found");
  emit("dish.deleted", r);
  return r;
}

// Reorder dishes within a category, and/or move a dish to another category.
export function reorderDishes(
  slug: string,
  categoryId: string,
  orderedIds: string[]
): StoredRestaurant {
  const r = mustRestaurant(slug);
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
  emit("dish.reordered", r);
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
