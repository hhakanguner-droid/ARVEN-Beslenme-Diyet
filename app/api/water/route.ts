import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1NutritionReadRepository } from "@/lib/persistence/read-repositories";

/** Quick water logging: appends one manual water event, then returns today's refreshed snapshot. */
export async function POST(request: Request) {
  try {
    const { subject, runner, service, todayLocalDate } = await resolveRouteContext(request);
    const body: unknown = await request.json().catch(() => ({}));
    const milliliters = (body as { milliliters?: unknown }).milliliters;
    if (typeof milliliters !== "number") return Response.json({ error: "milliliters is required and must be a number" }, { status: 400 });

    await service.appendManualWater(new Date().toISOString(), milliliters);

    const snapshot = await new V1NutritionReadRepository(runner).getDailySnapshot(subject, todayLocalDate);
    return Response.json(snapshot);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
