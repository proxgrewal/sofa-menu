// Supabase client factory for the production data + storage layer.
//
// The app ships with an in-memory seed store (lib/data.ts / lib/store.ts) so it
// runs with zero infrastructure. When the SUPABASE env vars are present, feature
// code can switch to these clients to read/write the real Postgres DB and the
// dish-photos storage bucket.
//
// `@supabase/supabase-js` is an OPTIONAL dependency: it is imported dynamically
// so the app typechecks and builds without it. To activate the production
// layer, run `npm install @supabase/supabase-js` and set the env vars below.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when the production DB/storage layer is configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

async function createClientDynamic(key: string, opts?: Record<string, unknown>) {
  // Indirect (non-literal) specifier keeps the typechecker/bundler from
  // requiring the module at build time when it isn't installed.
  const spec = ["@supabase", "supabase-js"].join("/");
  const mod: any = await import(/* webpackIgnore: true */ spec);
  return mod.createClient(url as string, key, opts);
}

/** Browser/anon client — respects Row Level Security. */
export async function getBrowserClient() {
  if (!url || !anonKey) throw new Error("Supabase env not configured");
  return createClientDynamic(anonKey);
}

/** Server client with the service-role key — bypasses RLS. Server-only. */
export async function getServiceClient() {
  if (!url || !serviceKey) throw new Error("Supabase service env not configured");
  return createClientDynamic(serviceKey, { auth: { persistSession: false } });
}

export const DISH_PHOTOS_BUCKET = "dish-photos";
