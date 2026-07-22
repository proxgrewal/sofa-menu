import { updateDish, deleteDish, type DishInput } from "@/lib/store";
import { handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; dishId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, dishId } = await params;
    const body = await readJson<DishInput>(req);
    return json(updateDish(slug, dishId, body));
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, dishId } = await params;
    return json(deleteDish(slug, dishId));
  });
}
