"use client";

import "./sofa5.css";
import { useCallback, useState } from "react";
import { useMenuStream, formatPrice } from "@/lib/useMenuStream";
import type { StoredRestaurant, StoredCategory, StoredDish } from "@/lib/store";

// Restaurant admin (SOFA-5). Non-technical users edit categories & dishes here;
// every save hits the API, which broadcasts over SSE so the guest menu (and any
// other open admin tab) updates instantly. Reordering uses up/down controls to
// stay dependency-free and touch-friendly.
export default function AdminBoard({
  slug,
  initial,
}: {
  slug: string;
  initial: StoredRestaurant;
}) {
  const { restaurant, connected } = useMenuStream(slug, initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Thin fetch wrapper: surfaces API errors and manages a global busy flag.
  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(path, {
          ...init,
          headers:
            init?.body && !(init.body instanceof FormData)
              ? { "content-type": "application/json", ...init?.headers }
              : init?.headers,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `request failed (${res.status})`);
        }
        return res.json();
      } catch (e) {
        setError(e instanceof Error ? e.message : "request failed");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const r = restaurant ?? initial;
  const cats = r.menu.categories;

  const addCategory = async () => {
    const name = prompt("New category name?");
    if (name?.trim()) await call(`/api/restaurants/${slug}/categories`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  };

  const moveCategory = async (index: number, dir: -1 | 1) => {
    const ids = cats.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await call(`/api/restaurants/${slug}/categories/reorder`, {
      method: "POST",
      body: JSON.stringify({ orderedIds: ids }),
    });
  };

  return (
    <main className="shell admin">
      <header className="admin-header">
        <div>
          <h1>{r.name} — Admin</h1>
          <p className="tagline">Edit your menu. Changes go live instantly.</p>
        </div>
        <div className="admin-actions">
          <a className="btn ghost" href={`/m/${slug}`} target="_blank" rel="noreferrer">
            View guest menu ↗
          </a>
          <span className={`live-dot ${connected ? "on" : "off"}`}>
            {connected ? "● Live" : "○ Offline"}
          </span>
        </div>
      </header>

      {error && <div className="banner error" role="alert">{error}</div>}
      {busy && <div className="banner info">Saving…</div>}

      {cats.map((cat, i) => (
        <CategoryCard
          key={cat.id}
          slug={slug}
          currency={r.currency}
          category={cat}
          canMoveUp={i > 0}
          canMoveDown={i < cats.length - 1}
          onMoveUp={() => moveCategory(i, -1)}
          onMoveDown={() => moveCategory(i, 1)}
          call={call}
        />
      ))}

      <button className="btn primary add-cat" onClick={addCategory} disabled={busy}>
        + Add category
      </button>
    </main>
  );
}

type Call = (path: string, init?: RequestInit) => Promise<any>;

function CategoryCard({
  slug,
  currency,
  category,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  call,
}: {
  slug: string;
  currency: string;
  category: StoredCategory;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  call: Call;
}) {
  const rename = async () => {
    const name = prompt("Rename category", category.name);
    if (name?.trim() && name !== category.name)
      await call(`/api/restaurants/${slug}/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
  };

  const remove = async () => {
    if (confirm(`Delete category "${category.name}" and its dishes?`))
      await call(`/api/restaurants/${slug}/categories/${category.id}`, { method: "DELETE" });
  };

  const addDish = async () => {
    const name = prompt("New dish name?");
    if (name?.trim())
      await call(`/api/restaurants/${slug}/categories/${category.id}/dishes`, {
        method: "POST",
        body: JSON.stringify({ name, priceCents: 0 }),
      });
  };

  const moveDish = async (index: number, dir: -1 | 1) => {
    const ids = category.dishes.map((d) => d.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await call(`/api/restaurants/${slug}/categories/${category.id}/dishes/reorder`, {
      method: "POST",
      body: JSON.stringify({ orderedIds: ids }),
    });
  };

  return (
    <section className="admin-cat">
      <div className="admin-cat-head">
        <h2>{category.name}</h2>
        <div className="ctrls">
          <button className="icon" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move category up">↑</button>
          <button className="icon" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move category down">↓</button>
          <button className="icon" onClick={rename} aria-label="Rename category">✎</button>
          <button className="icon danger" onClick={remove} aria-label="Delete category">🗑</button>
        </div>
      </div>

      {category.dishes.length === 0 && <p className="empty">No dishes yet.</p>}

      {category.dishes.map((dish, i) => (
        <DishRow
          key={dish.id}
          slug={slug}
          currency={currency}
          dish={dish}
          canMoveUp={i > 0}
          canMoveDown={i < category.dishes.length - 1}
          onMoveUp={() => moveDish(i, -1)}
          onMoveDown={() => moveDish(i, 1)}
          call={call}
        />
      ))}

      <button className="btn ghost add-dish" onClick={addDish}>+ Add dish</button>
    </section>
  );
}

function DishRow({
  slug,
  currency,
  dish,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  call,
}: {
  slug: string;
  currency: string;
  dish: StoredDish;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  call: Call;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dish.name);
  const [description, setDescription] = useState(dish.description);
  const [price, setPrice] = useState((dish.priceCents / 100).toFixed(2));
  const [uploading, setUploading] = useState(false);

  const base = `/api/restaurants/${slug}/dishes/${dish.id}`;

  const save = async () => {
    const priceCents = Math.round(parseFloat(price || "0") * 100);
    await call(base, {
      method: "PATCH",
      body: JSON.stringify({ name, description, priceCents }),
    });
    setEditing(false);
  };

  const toggleAvailable = async () => {
    await call(base, { method: "PATCH", body: JSON.stringify({ available: !dish.available }) });
  };

  const remove = async () => {
    if (confirm(`Delete "${dish.name}"?`)) await call(base, { method: "DELETE" });
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await call(`/api/upload`, { method: "POST", body: fd });
      await call(base, { method: "PATCH", body: JSON.stringify({ photoUrl: url }) });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    await call(base, { method: "PATCH", body: JSON.stringify({ photoUrl: null }) });
  };

  return (
    <article className={`admin-dish ${dish.available ? "" : "unavailable"}`}>
      <label className="photo-slot">
        {dish.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dish.photoUrl} alt={dish.name} />
        ) : (
          <span className="ph">{uploading ? "…" : "＋ photo"}</span>
        )}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
            e.target.value = "";
          }}
        />
      </label>

      <div className="admin-dish-body">
        {editing ? (
          <div className="edit-fields">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dish name" />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              rows={2}
            />
            <div className="price-field">
              <span>{currency}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="edit-actions">
              <button className="btn primary" onClick={save}>Save</button>
              <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="view-fields" onClick={() => setEditing(true)}>
            <div className="row">
              <p className="name">{dish.name}</p>
              <span className="price">{formatPrice(dish.priceCents, currency)}</span>
            </div>
            {dish.description && <p className="desc">{dish.description}</p>}
            {!dish.available && <span className="badge">86'd — hidden from guests</span>}
          </div>
        )}
      </div>

      <div className="admin-dish-ctrls">
        <button className="icon" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move up">↑</button>
        <button className="icon" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move down">↓</button>
        <button className="icon" onClick={toggleAvailable} aria-label="Toggle availability" title={dish.available ? "Mark unavailable" : "Mark available"}>
          {dish.available ? "◉" : "○"}
        </button>
        {dish.photoUrl && <button className="icon" onClick={removePhoto} aria-label="Remove photo" title="Remove photo">⌫</button>}
        <button className="icon danger" onClick={remove} aria-label="Delete dish">🗑</button>
      </div>
    </article>
  );
}
