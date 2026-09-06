import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";

/** Serves one body-progress photo's raw bytes back to its owning subject only, same pattern as `/api/photos/[id]`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const asset = await context.service.getBodyPhotoSet(id);
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
    const asset = await context.service.getBodyPhotoSet(id);
    if (!asset) return Response.json({ error: "Photo not found" }, { status: 404 });
    await context.service.deleteBodyPhotoSet(id);
    await getMediaStorage().delete(asset.storageKey);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
