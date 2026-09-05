import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** Every lab result entry for the authenticated subject, most recent first — extracted and confirmed alike; the client separates them by `status`. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ entries: await context.service.listLabResultEntries() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type ManualLabEntryBody = { markerName?: unknown; valueText?: unknown; unitText?: unknown; referenceRangeText?: unknown };

/** Manual entry: the user types a reading themselves (no photo, no AI) — already 'confirmed', since there is nothing to review. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as ManualLabEntryBody;
    const entry = await context.service.recordManualLabResultEntry({
      labDocumentId: null,
      markerName: body.markerName,
      valueText: body.valueText,
      unitText: body.unitText ?? null,
      referenceRangeText: body.referenceRangeText ?? null,
    });
    return Response.json({ entry });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
