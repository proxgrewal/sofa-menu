import QRCode from "qrcode";
import { getRestaurantBySlug } from "@/lib/data";
import { getBaseUrl, menuPath } from "@/lib/url";

// Generates a unique PNG QR code per restaurant that resolves to its menu URL.
// GET /r/{slug}/qr -> image/png
//
// Rendered dynamically: the encoded target is built from getBaseUrl() (env
// override NEXT_PUBLIC_BASE_URL, else the inbound request Host), so the QR is
// scannable regardless of which origin the app is served from.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const restaurant = getRestaurantBySlug(slug);
  if (!restaurant) {
    return new Response("Restaurant not found", { status: 404 });
  }

  const target = `${await getBaseUrl()}${menuPath(slug)}`;
  const png = await QRCode.toBuffer(target, {
    type: "png",
    margin: 2,
    width: 512,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
