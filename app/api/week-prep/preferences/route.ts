import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** The authenticated subject's week-prep reminder preference, or null before one has ever been set. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ preferences: await context.service.getWeekPrepPreferences() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type WeekPrepPreferencesBody = { enabled?: unknown; prepDayOfWeek?: unknown; prepLocalTime?: unknown };

/**
 * Upserts the reminder preference. Deliberately just a stored preference the app reads to show an
 * in-app reminder — NOT a push-notification scheduler (see docs/ARCHITECTURE.md's Phase 7 entry).
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as WeekPrepPreferencesBody;
    const preferences = await context.service.upsertWeekPrepPreferences({
      enabled: body.enabled,
      prepDayOfWeek: body.prepDayOfWeek,
      prepLocalTime: body.prepLocalTime,
    });
    return Response.json({ preferences });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
