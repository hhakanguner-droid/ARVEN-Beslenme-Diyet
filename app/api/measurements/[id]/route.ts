import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** User-initiated forget for one measurement — does not retract any milestone it helped earn, see `StoredProgressMilestone`'s doc comment. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    await context.service.deleteBodyMeasurement(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
