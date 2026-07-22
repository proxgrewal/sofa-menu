import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { handle, json } from "@/lib/http";
import { getServiceClient, isSupabaseConfigured, DISH_PHOTOS_BUCKET } from "@/lib/supabase";

// Photo upload: accepts a multipart form with a `file` field and returns the
// public URL to store on the dish. Non-technical users just pick a photo; the
// admin UI wires the returned url into the dish.
//
// SOFA-13: when Supabase is configured the file is uploaded (server-side, with
// the service-role key) to the public `dish-photos` storage bucket and the CDN
// URL is returned — this survives Vercel's ephemeral filesystem. Otherwise it
// falls back to writing under public/uploads for local dev.
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "no file provided" }, 400);

    const ext = EXT_BY_TYPE[file.type];
    if (!ext) return json({ error: `unsupported image type: ${file.type || "unknown"}` }, 415);

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) return json({ error: "empty file" }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: "file too large (max 8MB)" }, 413);

    const name = `${randomUUID()}.${ext}`;

    if (isSupabaseConfigured()) {
      const sb = await getServiceClient();
      const { error } = await sb.storage
        .from(DISH_PHOTOS_BUCKET)
        .upload(name, bytes, { contentType: file.type, upsert: false });
      if (error) return json({ error: `upload failed: ${error.message}` }, 500);
      const { data } = sb.storage.from(DISH_PHOTOS_BUCKET).getPublicUrl(name);
      return json({ url: data.publicUrl }, 201);
    }

    const dir = join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), bytes);
    return json({ url: `/uploads/${name}` }, 201);
  });
}
