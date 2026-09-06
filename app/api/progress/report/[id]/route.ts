import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";

/** Serves one generated report's PDF bytes back to its owning subject only, same pattern as `/api/photos/[id]`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const report = await context.service.getProgressReportExport(id);
    if (!report) return Response.json({ error: "Report not found" }, { status: 404 });
    const media = await getMediaStorage().get(report.storageKey);
    if (!media) return Response.json({ error: "Report not found" }, { status: 404 });
    return new Response(Buffer.from(media.bytes), { headers: { "Content-Type": media.contentType, "Content-Disposition": `attachment; filename="arven-${report.reportType}-${report.periodLocalDate}.pdf"`, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Deletes both the metadata row and the underlying PDF bytes, scoped to the authenticated subject. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const report = await context.service.getProgressReportExport(id);
    if (!report) return Response.json({ error: "Report not found" }, { status: 404 });
    await context.service.deleteProgressReportExport(id);
    await getMediaStorage().delete(report.storageKey);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
