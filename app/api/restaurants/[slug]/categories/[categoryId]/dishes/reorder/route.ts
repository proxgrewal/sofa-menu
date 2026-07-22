import { reorderDishes } from "@/lib/store";
import { handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; categoryId: string }> };

// orderedIds is the full ordered list of dish ids that should live in this
// category after the move (supports both in-category reorder and moving a dish
// in from another category).
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, categoryId } = await params;
    const { orderedIds } = await readJson<{ orderedIds?: string[] }>(req);
    return json(reorderDishes(slug, categoryId, orderedIds ?? []));
  });
}
