import { createDish, type DishInput } from "@/lib/store";
import { handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; categoryId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, categoryId } = await params;
    const body = await readJson<DishInput>(req);
    return json(createDish(slug, categoryId, body), 201);
  });
}
