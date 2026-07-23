"use client";

import { useEffect, useState } from "react";
import type { StoredRestaurant } from "./store";

type StreamState = {
  restaurant: StoredRestaurant | null;
  connected: boolean;
};

// Subscribes to the SSE menu stream for a restaurant and returns the latest
// state. Used by the guest menu (live updates) and the admin UI (so two open
// tabs stay in sync). Falls back to a one-shot fetch if EventSource is missing.
export function useMenuStream(slug: string, initial: StoredRestaurant | null = null): StreamState {
  const [restaurant, setRestaurant] = useState<StoredRestaurant | null>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      fetch(`/api/restaurants/${slug}/menu`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setRestaurant(data))
        .catch(() => {});
      return;
    }

    const es = new EventSource(`/api/restaurants/${slug}/stream`);
    const onMessage = (e: MessageEvent) => {
      try {
        setRestaurant(JSON.parse(e.data));
      } catch {
        /* ignore malformed frame */
      }
    };
    es.addEventListener("snapshot", onMessage);
    // Every mutation event carries the full restaurant; handle them uniformly.
    for (const ev of [
      "category.created",
      "category.updated",
      "category.deleted",
      "category.reordered",
      "dish.created",
      "dish.updated",
      "dish.deleted",
      "dish.reordered",
    ]) {
      es.addEventListener(ev, onMessage);
    }
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [slug]);

  return { restaurant, connected };
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
