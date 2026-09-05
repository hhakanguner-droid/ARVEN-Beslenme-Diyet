import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";

/** Serves one lab document's raw bytes back to its owning subject only — same shape as /api/photos/[id]. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const document = await context.service.getLabDocument(id);
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    const media = await getMediaStorage().get(document.storageKey);
    if (!media) return Response.json({ error: "Document not found" }, { status: 404 });
    return new Response(Buffer.from(media.bytes), { headers: { "Content-Type": media.contentType, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * Deletes the sensitive object before deleting its metadata. If object deletion fails, metadata
 * remains intact so a later retry still knows the storage key; this avoids untraceable orphaned
 * lab files. Existing lab_result_entries survive through the schema's ON DELETE SET NULL.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const document = await context.service.getLabDocument(id);
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    await getMediaStorage().delete(document.storageKey);
    await context.service.deleteLabDocument(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
