import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { NUTRITION_CALCULATION_VERSION } from "@/lib/persistence/v1-boundary";

type ClientMealItem = { foodVersionId: string; selection: { kind: "household"; portionVersionId: string; quantity: number } | { kind: "custom-grams"; grams: number } };
type ClientSlot = { mealType: string; items: ClientMealItem[] };

/** "Planım": the authenticated user's current versioned day plan, or null before one has ever been created. */
export async function GET(request: Request) {
  try {
    const { service } = await resolveRouteContext(request);
    const plan = await service.getCurrentMealPlan();
    return Response.json({ plan: plan ? { id: plan.id, createdAt: plan.createdAt, slots: JSON.parse(plan.slotsJson) } : null });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Creates a new plan version (replacing the current one) from one or more meal slots. */
export async function POST(request: Request) {
  try {
    const { service } = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { slots?: ClientSlot[] };
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      return Response.json({ error: "at least one slot is required" }, { status: 400 });
    }

    const plan = await service.createMealPlanVersion({
      schemaVersion: "MealPlanVersionV1",
      slots: body.slots.map((slot) => ({
        mealType: slot.mealType,
        items: slot.items.map((item) => ({ foodVersionId: item.foodVersionId, calculationVersion: NUTRITION_CALCULATION_VERSION, selection: item.selection })),
      })),
    });

    return Response.json({ plan: { id: plan.id, createdAt: plan.createdAt, slots: JSON.parse(plan.slotsJson) } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
