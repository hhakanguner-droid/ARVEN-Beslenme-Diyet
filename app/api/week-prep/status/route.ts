import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** Whether the authenticated subject has marked week-prep complete for one specific week. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const url = new URL(request.url);
    const weekStartLocalDate = url.searchParams.get("weekStartLocalDate");
    if (!weekStartLocalDate) return Response.json({ error: "weekStartLocalDate is required" }, { status: 400 });
    const status = await context.service.getWeekPrepStatus(weekStartLocalDate);
    return Response.json({ isCompleted: status?.isCompleted ?? false });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Sets the week-prep completion flag for one week (a simple checklist checkbox, not a scheduler). */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { weekStartLocalDate?: unknown; isCompleted?: unknown };
    if (typeof body.weekStartLocalDate !== "string") return Response.json({ error: "weekStartLocalDate is required" }, { status: 400 });
    if (typeof body.isCompleted !== "boolean") return Response.json({ error: "isCompleted must be a boolean" }, { status: 400 });
    const status = await context.service.setWeekPrepStatus(body.weekStartLocalDate, body.isCompleted);
    return Response.json({ status });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
