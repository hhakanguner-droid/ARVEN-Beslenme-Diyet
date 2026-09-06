import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** Every body measurement for the authenticated subject ("Gelişim", Faz 8). */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ measurements: await context.service.listBodyMeasurements() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Logs one measurement and returns any milestones newly earned by it — see `V1MutationService.recordBodyMeasurement`. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = await request.json().catch(() => ({}));
    const { measurement, newMilestones } = await context.service.recordBodyMeasurement({ schemaVersion: "BodyMeasurementCreateV1", ...(body as object) });
    return Response.json({ measurement, newMilestones });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
