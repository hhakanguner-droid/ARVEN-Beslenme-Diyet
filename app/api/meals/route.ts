import { buildTodayPayload, resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { NUTRITION_CALCULATION_VERSION } from "@/lib/persistence/v1-boundary";

type ClientMealItem = { foodVersionId: string; selection: { kind: "household"; portionVersionId: string; quantity: number } | { kind: "custom-grams"; grams: number } };

/** Manual meal logging ("hızlı ekle"): the client only sends food + portion; the calculation version is an internal detail. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { mealType?: unknown; items?: ClientMealItem[] };
    if (typeof body.mealType !== "string" || !Array.isArray(body.items)) {
      return Response.json({ error: "mealType and items are required" }, { status: 400 });
    }

    await context.service.appendManualMeal({
      occurredAt: new Date().toISOString(),
      mealType: body.mealType as never,
      items: body.items.map((item) => ({ foodVersionId: item.foodVersionId, calculationVersion: NUTRITION_CALCULATION_VERSION, selection: item.selection })),
    });

    return Response.json(await buildTodayPayload(context));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
