import { getRestaurant, subscribe, type StoredRestaurant } from "@/lib/store";
import { json } from "@/lib/http";

// SSE stream of live menu state. The guest menu subscribes here; every admin
// mutation pushes the full restaurant so clients can re-render with no polling.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const initial = await getRestaurant(slug);
  if (!initial) return json({ error: "restaurant not found" }, 404);

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, r: StoredRestaurant) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(r)}\n\n`)
        );
      };
      // Prime the client with current state immediately.
      send("snapshot", initial);
      unsubscribe = subscribe(slug, send);
      // Comment heartbeat keeps proxies from closing the idle connection.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* stream already closed */
        }
      }, 25000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
