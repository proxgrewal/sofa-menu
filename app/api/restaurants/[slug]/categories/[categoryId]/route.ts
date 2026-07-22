import { updateCategory, deleteCategory } from "@/lib/store";
import { handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; categoryId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, categoryId } = await params;
    const { name } = await readJson<{ name?: string }>(req);
    return json(updateCategory(slug, categoryId, name ?? ""));
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, categoryId } = await params;
    return json(deleteCategory(slug, categoryId));
  });
}
