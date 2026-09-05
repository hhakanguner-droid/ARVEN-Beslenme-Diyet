import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";

/**
 * Serves one photo's raw bytes back to its owning subject only — `getPhotoAsset` already scopes the
 * metadata lookup to `context.subject`, so a missing/foreign id both resolve to a plain 404 (never
 * leaking whether the id belongs to someone else).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const asset = await context.service.getPhotoAsset(id);
    if (!asset) return Response.json({ error: "Photo not found" }, { status: 404 });
    const media = await getMediaStorage().get(asset.storageKey);
    if (!media) return Response.json({ error: "Photo not found" }, { status: 404 });
    return new Response(Buffer.from(media.bytes), { headers: { "Content-Type": media.contentType, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Deletes both the metadata row and the underlying bytes, scoped to the authenticated subject. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const asset = await context.service.getPhotoAsset(id);
    if (!asset) return Response.json({ error: "Photo not found" }, { status: 404 });
    await context.service.deletePhotoAsset(id);
    await getMediaStorage().delete(asset.storageKey);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
