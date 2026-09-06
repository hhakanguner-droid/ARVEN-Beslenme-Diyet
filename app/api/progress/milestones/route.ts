import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** Every milestone the authenticated subject has earned, most recent first — see `evaluateBodyMeasurementMilestones`. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ milestones: await context.service.listProgressMilestones() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
