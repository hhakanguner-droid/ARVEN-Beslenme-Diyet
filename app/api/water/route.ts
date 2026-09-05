import { buildTodayPayload, resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** Quick water logging: appends one manual water event, then returns today's refreshed snapshot. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body: unknown = await request.json().catch(() => ({}));
    const milliliters = (body as { milliliters?: unknown }).milliliters;
    if (typeof milliliters !== "number") return Response.json({ error: "milliliters is required and must be a number" }, { status: 400 });

    await context.service.appendManualWater(new Date().toISOString(), milliliters);

    return Response.json(await buildTodayPayload(context));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
