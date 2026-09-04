import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1FoodReadRepository } from "@/lib/persistence/read-repositories";

/**
 * Manual barcode lookup against the local verified catalog, e.g. `/api/foods/barcode?code=1234567890123`.
 * Camera-based scanning and live Open Food Facts import are deliberately out of scope for this slice
 * (see `lib/nutrition/providers/open-food-facts.ts`'s doc comment) — this only resolves a barcode a
 * user types in against foods already in the catalog.
 */
export async function GET(request: Request) {
  try {
    const { subject, runner } = await resolveRouteContext(request);
    const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
    if (!code) return Response.json({ error: "code is required" }, { status: 400 });
    const food = await new V1FoodReadRepository(runner).findByBarcode(subject, code);
    return Response.json({ food });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
