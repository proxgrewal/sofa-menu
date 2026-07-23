"use client";

// SOFA-16 — owner logout. Clears the session cookie then reloads, which sends
// the owner back through the login gate.
import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      window.location.assign("/admin/login");
    }
  }
  return (
    <button className="btn ghost" onClick={logout} disabled={busy} title="Sign out">
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
