#!/usr/bin/env node
// Generate printable QR assets (PNG + SVG) for a restaurant's guest menu.
//
//   NEXT_PUBLIC_BASE_URL="https://menu.sofa.app" node scripts/gen-qr.js <slug>
//   node scripts/gen-qr.js            # all restaurants, localhost base
//
// Output: public/qr/<slug>.png and public/qr/<slug>.svg
//
// The in-app route GET /r/<slug>/qr serves the same PNG on demand; this script
// exists so onboarding can hand a file straight to a printer (RUNBOOK step 2).

const fs = require("node:fs");
const path = require("node:path");
const QRCode = require("qrcode");

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = path.join(process.cwd(), "public", "qr");

function menuUrl(slug) {
  return `${BASE}/r/${slug}`;
}

// Read slugs from lib/data.ts without importing TS: match `slug: "..."`.
function readSlugs() {
  const src = fs.readFileSync(path.join(process.cwd(), "lib", "data.ts"), "utf8");
  return [...src.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

async function genOne(slug) {
  const url = menuUrl(slug);
  const opts = { margin: 2, width: 512, color: { dark: "#1a1a1a", light: "#ffffff" } };
  const png = await QRCode.toBuffer(url, { type: "png", ...opts });
  const svg = await QRCode.toString(url, { type: "svg", ...opts });
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), png);
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), svg);
  console.log(`  ✓ ${slug.padEnd(16)} -> ${url}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const arg = process.argv[2];
  const slugs = arg ? [arg] : readSlugs();
  if (slugs.length === 0) {
    console.error("No slugs found. Pass one explicitly: node scripts/gen-qr.js <slug>");
    process.exit(1);
  }
  console.log(`Generating QR codes (base: ${BASE})`);
  for (const slug of slugs) await genOne(slug);
  console.log(`Done. Files in public/qr/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
