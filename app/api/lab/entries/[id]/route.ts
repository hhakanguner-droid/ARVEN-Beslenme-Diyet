import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

type ConfirmLabEntryBody = { markerName?: unknown; valueText?: unknown; unitText?: unknown; referenceRangeText?: unknown };

/** Confirms an 'extracted' (AI-transcribed) or previously-confirmed entry, applying the user's edits to the transcribed text — the review step the Phase 6 roadmap calls "extracted vs confirmed separation". */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as ConfirmLabEntryBody;
    const entry = await context.service.confirmLabResultEntry(id, {
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

/** Rejects an unreviewed extraction, or removes a confirmed entry the user no longer wants on file. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    await context.service.deleteLabResultEntry(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
