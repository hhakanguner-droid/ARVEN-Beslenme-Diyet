import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { NUTRITION_CALCULATION_VERSION } from "@/lib/persistence/v1-boundary";

type ClientIngredient = { foodVersionId: string; selection: { kind: "household"; portionVersionId: string; quantity: number } | { kind: "custom-grams"; grams: number } };

/** "Tarif oluşturucu": sums verified ingredients into one new reusable custom food, private to this user. */
export async function POST(request: Request) {
  try {
    const { service } = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; servings?: unknown; servingLabel?: unknown; ingredients?: ClientIngredient[] };
    if (typeof body.name !== "string" || !Array.isArray(body.ingredients)) {
      return Response.json({ error: "name and ingredients are required" }, { status: 400 });
    }

    const food = await service.createRecipeFood({
      schemaVersion: "RecipeFoodV1",
      name: body.name,
      servings: typeof body.servings === "number" ? body.servings : 1,
      servingLabel: typeof body.servingLabel === "string" && body.servingLabel.trim() ? body.servingLabel : undefined,
      ingredients: body.ingredients.map((item) => ({ foodVersionId: item.foodVersionId, calculationVersion: NUTRITION_CALCULATION_VERSION, selection: item.selection })),
    });

    return Response.json({ food });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
