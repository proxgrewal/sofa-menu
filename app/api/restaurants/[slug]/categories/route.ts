import { createCategory } from "@/lib/store";
import { handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const { name } = await readJson<{ name?: string }>(req);
    return json(createCategory(slug, name ?? ""), 201);
  });
}
