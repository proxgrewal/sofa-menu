import { getAllRestaurants } from "@/lib/data";
import { menuPath } from "@/lib/url";

// Under a project sub-path deploy (GitHub Pages), raw <img>/<a> are not
// auto-prefixed by Next, so build the prefix from the same env the config uses.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Directory / demo landing page: shows each restaurant's generated QR code and
// a link to its live menu. Scan a QR with a phone to open the mobile menu.
export default function Home() {
  const restaurants = getAllRestaurants();

  return (
    <main className="shell">
      <header className="menu-header">
        <h1>SOFA</h1>
        <p className="tagline">
          Every menu one scan away. Scan a code below to open a live menu.
        </p>
      </header>

      {restaurants.map((r) => (
        <div className="card" key={r.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}${menuPath(r.slug)}/qr`}
            alt={`${r.name} QR code`}
            width={88}
            height={88}
          />
          <div className="meta">
            <h3>{r.name}</h3>
            <p>{r.tagline}</p>
            <a className="btn" href={`${BASE_PATH}${menuPath(r.slug)}`}>
              Open menu →
            </a>
          </div>
        </div>
      ))}

      <p className="footer">Powered by SOFA · Scan. Order. Feast. Anywhere.</p>
    </main>
  );
}
