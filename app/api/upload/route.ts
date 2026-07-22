import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { handle, json } from "@/lib/http";

// Photo upload: accepts a multipart form with a `file` field, writes it under
// public/uploads, and returns the public URL to store on the dish. Non-technical
// users just pick a photo; the admin UI wires the returned url into the dish.
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

    const dir = join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), bytes);

    return json({ url: `/uploads/${name}` }, 201);
  });
}
