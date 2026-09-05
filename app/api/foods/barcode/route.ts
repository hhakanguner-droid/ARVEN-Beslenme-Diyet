import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1FoodReadRepository } from "@/lib/persistence/read-repositories";
import { candidateToVerifiedFoodImport, getOptionalOpenFoodFactsClient } from "@/lib/nutrition/providers/open-food-facts";

/**
 * Manual (or camera-scanned) barcode lookup, e.g. `/api/foods/barcode?code=1234567890123`.
 * Checks the local verified catalog first; on a miss, and only when Open Food Facts is configured
 * (`OFF_CONTACT_USER_AGENT` set), falls back to a live Open Food Facts lookup and imports the
 * product into the shared catalog so it becomes a normal loggable food from then on. Any OFF/network
 * failure, or a product missing a macro ARVEN's catalog requires, degrades to the same "not found"
 * response a plain local miss would give — this endpoint never fails just because the external
 * source had a bad moment.
 */
export async function GET(request: Request) {
  try {
    const { subject, runner, service } = await resolveRouteContext(request);
    const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
    if (!code) return Response.json({ error: "code is required" }, { status: 400 });

    const local = await new V1FoodReadRepository(runner).findByBarcode(subject, code);
    if (local) return Response.json({ food: local });

    const off = getOptionalOpenFoodFactsClient();
    if (!off) return Response.json({ food: null });

    let lookup;
    try {
      lookup = await off.lookupBarcode(code);
    } catch {
      return Response.json({ food: null });
    }
    if ("found" in lookup) return Response.json({ food: null });

    const importInput = candidateToVerifiedFoodImport(code, lookup);
    if (!importInput) return Response.json({ food: null });

    const imported = await service.importVerifiedFood(importInput);
    return Response.json({ food: imported });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
