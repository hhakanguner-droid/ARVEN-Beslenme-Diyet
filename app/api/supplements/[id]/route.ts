import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

type SupplementActiveBody = { isActive?: unknown };

/** Toggles active/inactive ("stopped taking this") without losing the record. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as SupplementActiveBody;
    if (typeof body.isActive !== "boolean") {
      return Response.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    await context.service.setSupplementActive(id, body.isActive);
    return Response.json({ updated: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** User-initiated forget. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    await context.service.deleteSupplement(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
