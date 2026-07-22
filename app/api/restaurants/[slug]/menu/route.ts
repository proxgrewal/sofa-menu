import { getRestaurant } from "@/lib/store";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const r = getRestaurant(slug);
    if (!r) return json({ error: "restaurant not found" }, 404);
    return json(r);
  });
}
