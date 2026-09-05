import { buildTodayPayload, resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** "Bugün": today's real daily nutrition snapshot (targets vs. consumed, plus water) for the authenticated user, plus today's individual log entries so the user can undo one. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json(await buildTodayPayload(context));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Undo/correction: deletes one of today's manually-logged entries ("yemedim" / yanlış su ekledim), then returns the refreshed snapshot. */
export async function DELETE(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!eventId) return Response.json({ error: "eventId is required" }, { status: 400 });

    await context.service.deleteManualNutritionEvent(eventId);

    return Response.json(await buildTodayPayload(context));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
