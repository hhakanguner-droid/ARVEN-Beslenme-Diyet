import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { buildDailyProgressReport, buildWeeklyProgressReport } from "@/lib/progress/reports";

/**
 * Live (never persisted) deterministic progress numbers for the "Gelişim" screen — the same data a
 * PDF export would be built from, but computed on demand so the UI can show it without generating a
 * file. `?type=daily&localDate=YYYY-MM-DD` or `?type=weekly&weekStartLocalDate=YYYY-MM-DD`.
 */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const measurements = await context.service.listBodyMeasurements();
    if (type === "weekly") {
      const weekStartLocalDate = url.searchParams.get("weekStartLocalDate");
      if (!weekStartLocalDate) return Response.json({ error: "weekStartLocalDate is required" }, { status: 400 });
      const report = await buildWeeklyProgressReport(context.runner, context.subject, weekStartLocalDate, measurements);
      return Response.json({ report });
    }
    const localDate = url.searchParams.get("localDate") ?? context.todayLocalDate;
    const report = await buildDailyProgressReport(context.runner, context.subject, localDate, measurements);
    return Response.json({ report });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
