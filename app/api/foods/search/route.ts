import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1FoodReadRepository } from "@/lib/persistence/read-repositories";
import { candidateToVerifiedFoodImport, getOptionalOpenFoodFactsClient } from "@/lib/nutrition/providers/open-food-facts";

/** Bounds how many Open Food Facts results one search request will import, to keep a single request fast and avoid hammering OFF for a broad query. */
const MAX_OFF_IMPORTS_PER_SEARCH = 5;

/**
 * Verified-catalog food search by name, e.g. `/api/foods/search?q=yogurt`.
 * Always searches the local catalog first (so already-known foods answer instantly). If Open Food
 * Facts is configured (`OFF_CONTACT_USER_AGENT` set), it also searches OFF live and imports any new
 * products it finds — skipping barcodes already present locally, and skipping anything missing a
 * macro ARVEN's catalog requires — so those results become normal loggable foods immediately and
 * on every later search. Any OFF/network failure degrades silently to local-only results.
 */
export async function GET(request: Request) {
  try {
    const { subject, runner, service } = await resolveRouteContext(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const trimmed = query.trim();
    const localFoods = await new V1FoodReadRepository(runner).searchVerified(subject, trimmed, { limit: 20 });
    if (!trimmed) return Response.json({ foods: localFoods });

    const off = getOptionalOpenFoodFactsClient();
    if (!off) return Response.json({ foods: localFoods });

    let searchResult;
    try {
      searchResult = await off.searchProducts(trimmed, { pageSize: 10 });
    } catch {
      return Response.json({ foods: localFoods });
    }

    const knownBarcodes = new Set(localFoods.map((food) => food.barcode).filter((barcode): barcode is string => !!barcode));
    const importInputs = searchResult.products
      .filter((candidate) => candidate.barcode && !knownBarcodes.has(candidate.barcode))
      .map((candidate) => candidateToVerifiedFoodImport(candidate.barcode, candidate))
      .filter((input): input is NonNullable<typeof input> => input !== null)
      .slice(0, MAX_OFF_IMPORTS_PER_SEARCH);

    const imported = await Promise.all(
      importInputs.map((input) => service.importVerifiedFood(input).catch(() => null)),
    );
    const importedFoods = imported.filter((food): food is NonNullable<typeof food> => food !== null);

    return Response.json({ foods: [...localFoods, ...importedFoods] });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
