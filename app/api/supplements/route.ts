import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

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

/** Adds one supplement record. Not a medication registry — no dose or schedule field exists (see docs/ROADMAP.md's Phase 6 entry). */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as SupplementRecordBody;
    const supplement = await context.service.recordSupplement({
      foodVersionId: body.foodVersionId ?? null,
      name: body.name,
      note: body.note ?? null,
    });
    return Response.json({ supplement });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
