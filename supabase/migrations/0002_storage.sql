-- SOFA — image/photo storage for dish photos.
-- Creates a public read bucket `dish-photos`. Uploads (admin photo editing,
-- SOFA-5) are performed with the service-role key from the server, so writes
-- stay locked down while guests can read photos over the CDN.

insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;

-- Public, read-only access to dish photos.
create policy "Public read dish photos"
  on storage.objects for select
  using (bucket_id = 'dish-photos');

-- Writes are intentionally NOT granted to anon/authenticated here; the server
-- uploads with the service-role key, which bypasses RLS. Add an authenticated
-- INSERT/UPDATE policy here if/when restaurant staff upload from the browser.
