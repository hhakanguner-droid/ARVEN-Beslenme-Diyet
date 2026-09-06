import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { NUTRITION_CALCULATION_VERSION } from "@/lib/persistence/v1-boundary";

type ClientPlanItem =
  | { kind: "food"; foodVersionId: string; selection: { kind: "household"; portionVersionId: string; quantity: number } | { kind: "custom-grams"; grams: number } }
  | { kind: "recipe"; recipeId: string; servings: number };
type ClientSlot = { mealType: string; items: ClientPlanItem[] };
type ClientDay = { localDate: string; slots: ClientSlot[] };

/** "Haftalık planım": the authenticated user's current weekly plan for one specific week, or null before one has ever been created. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const url = new URL(request.url);
    const weekStartLocalDate = url.searchParams.get("weekStartLocalDate");
    if (!weekStartLocalDate) return Response.json({ error: "weekStartLocalDate is required" }, { status: 400 });
    const plan = await context.service.getCurrentWeeklyPlan(weekStartLocalDate);
    return Response.json({ plan: plan ? { id: plan.id, weekStartLocalDate: plan.weekStartLocalDate, createdAt: plan.createdAt, days: JSON.parse(plan.daysJson) } : null });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Creates a new weekly plan version (replacing the current one for this exact week) from seven days of slots. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { weekStartLocalDate?: unknown; days?: ClientDay[] };
    if (!Array.isArray(body.days) || body.days.length !== 7) {
      return Response.json({ error: "days must contain exactly 7 entries" }, { status: 400 });
    }
    const plan = await context.service.createWeeklyPlanVersion({
      schemaVersion: "WeeklyPlanVersionV1",
      weekStartLocalDate: body.weekStartLocalDate,
      days: body.days.map((day) => ({
        localDate: day.localDate,
        slots: day.slots.map((slot) => ({
          mealType: slot.mealType,
          items: slot.items.map((item) =>
            item.kind === "recipe"
              ? { kind: "recipe" as const, recipeId: item.recipeId, servings: item.servings }
              : { kind: "food" as const, foodVersionId: item.foodVersionId, calculationVersion: NUTRITION_CALCULATION_VERSION, selection: item.selection },
          ),
        })),
      })),
    });
    return Response.json({ plan: { id: plan.id, weekStartLocalDate: plan.weekStartLocalDate, createdAt: plan.createdAt, days: JSON.parse(plan.daysJson) } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
