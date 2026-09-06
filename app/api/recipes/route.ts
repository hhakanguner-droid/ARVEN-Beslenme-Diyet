import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { NUTRITION_CALCULATION_VERSION } from "@/lib/persistence/v1-boundary";

type ClientIngredient = { foodVersionId: string; selection: { kind: "household"; portionVersionId: string; quantity: number } | { kind: "custom-grams"; grams: number } };
type RecipeBody = { name?: unknown; servings?: unknown; ingredients?: ClientIngredient[] };

/** Every recipe for the authenticated subject, most recent first — see `RecipeCreateV1`'s doc comment for how this differs from the frozen "Tarif oluşturucu" (createRecipeFood). */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ recipes: await context.service.listRecipes() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Adds a new reusable recipe with stable (foodVersionId) ingredient references. There is deliberately no update endpoint — delete and recreate instead. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as RecipeBody;
    const recipe = await context.service.createRecipe({
      schemaVersion: "RecipeCreateV1",
      name: body.name,
      servings: body.servings,
      ingredients: (body.ingredients ?? []).map((ingredient) => ({
        foodVersionId: ingredient.foodVersionId,
        calculationVersion: NUTRITION_CALCULATION_VERSION,
        selection: ingredient.selection,
      })),
    });
    return Response.json({ recipe });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
