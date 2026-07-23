# Deploying SOFA

Two things ship from this repo:

| Target           | What                                                     | Trigger                                   | Public URL                          |
| ---------------- | -------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| **GitHub Pages** | Static status/skeleton page (`site/`)                    | push to `main` (path `site/**`) or manual | `https://<owner>.github.io/<repo>/` |
| **Vercel**       | The full dynamic Next.js app (menu, QR, admin, ordering) | push to `main`                            | Vercel-assigned + custom domain     |

## How to deploy a change

1. Open a PR to `main`. **CI** (`.github/workflows/ci.yml`) runs typecheck,
   lint, and `next build`.
2. Merge to `main`. Vercel's Git integration builds and deploys the app; the
   Pages workflow republishes the status page if `site/**` changed.

That's it — no manual steps once the one-time setup below is done.

## One-time setup (requires account provisioning)

The dynamic app needs a host and a database. These require external accounts and
secrets that a human/owner must provision — see
[SOFA-3 follow-up](#production-provisioning-checklist).

### 1. GitHub Pages (status page — no external account)

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. The
`deploy-pages.yml` workflow then publishes `site/` on every push to `main`.

### 2. Supabase (database + dish photo storage)

1. Create a project at supabase.com.
2. Apply the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # applies supabase/migrations/*.sql
   ```
   or paste `supabase/migrations/0001_init.sql` and `0002_storage.sql` into the
   SQL editor.
3. Copy the Project URL, `anon` key, and `service_role` key.

### 3. Vercel (app hosting)

1. Import the GitHub repo at vercel.com (framework auto-detected via
   `vercel.json`).
2. Add environment variables (Production + Preview):
   - `NEXT_PUBLIC_BASE_URL` = your Vercel/custom domain
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
3. Deploy. Vercel redeploys automatically on every push to `main`.

## Production provisioning checklist

These steps need paid/owned external accounts and cannot be automated from CI
without credentials:

- [ ] Create Supabase project, run migrations, note keys
- [ ] Create Vercel project, connect repo, set env vars
- [ ] (optional) point a custom domain at Vercel
- [ ] Enable GitHub Pages (Source: GitHub Actions)

Once the Supabase + Vercel secrets exist, the app is live at a public URL with
the database connected. Until then the app runs on in-memory seed data locally
and the static skeleton is live on GitHub Pages.
