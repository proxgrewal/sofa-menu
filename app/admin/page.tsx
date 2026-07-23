import Link from "next/link";
import "@/components/sofa5.css";
import { listRestaurants } from "@/lib/store";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "SOFA — Restaurant Admin" };

// Admin home: pick a restaurant to manage.
export default async function AdminIndex() {
  const restaurants = await listRestaurants();
  return (
    <main className="shell admin-index">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1>Restaurant Admin</h1>
        <LogoutButton />
      </div>
      <p className="tagline">Choose a restaurant to edit its live menu.</p>
      <ul className="admin-list">
        {restaurants.map((r) => (
          <li key={r.slug}>
            <div>
              <strong>{r.name}</strong>
              <span className="muted">{r.tagline}</span>
            </div>
            <div className="links">
              <Link className="btn primary" href={`/admin/${r.slug}`}>Edit menu →</Link>
              <Link className="btn ghost" href={`/m/${r.slug}`}>Guest view</Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
