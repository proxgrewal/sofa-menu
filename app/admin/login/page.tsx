"use client";

// SOFA-16 — owner login screen.
//
// Posts the password to /api/admin/session, which sets the signed session
// cookie; on success we bounce to `?next=` (the page the middleware bounced
// us away from) or the admin home.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "@/components/sofa5.css";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Full navigation so the new cookie is picked up by the server render.
        window.location.assign(next.startsWith("/") ? next : "/admin");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 380 }}>
      <h1>Owner sign in</h1>
      <p className="tagline">Enter the owner password to manage your menu.</p>
      <form onSubmit={submit} className="admin-login">
        <label htmlFor="pw" className="muted">Password</label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{ width: "100%", padding: "0.6rem", marginTop: 4, marginBottom: 12 }}
        />
        {error && (
          <p role="alert" style={{ color: "var(--danger, #c0392b)", margin: "0 0 12px" }}>
            {error}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="shell" style={{ maxWidth: 380 }}><h1>Owner sign in</h1></main>}>
      <LoginForm />
    </Suspense>
  );
}
