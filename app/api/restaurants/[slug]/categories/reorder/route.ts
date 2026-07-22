import { reorderCategories } from "@/lib/store";
import { handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const { orderedIds } = await readJson<{ orderedIds?: string[] }>(req);
    return json(reorderCategories(slug, orderedIds ?? []));
  });
}
