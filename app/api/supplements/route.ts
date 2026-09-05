import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { isKnownSupplementName } from "@/lib/supplements/reference";

/** Every supplement record for the authenticated subject, most recent first — active and inactive alike. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ supplements: await context.service.listSupplements() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type SupplementRecordBody = { foodVersionId?: unknown; name?: unknown; note?: unknown };

/**
 * Adds one supplement record. Free-text names are deliberately restricted to the curated
 * supplement reference so this endpoint cannot silently become a medication registry/tracker.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as SupplementRecordBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || !isKnownSupplementName(name)) {
      return Response.json({ error: "unverified-supplement-name" }, { status: 400 });
    }
    const supplement = await context.service.recordSupplement({
      foodVersionId: body.foodVersionId ?? null,
      name,
      note: body.note ?? null,
    });
    return Response.json({ supplement });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
