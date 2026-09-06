import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";
import { buildDailyProgressReport, buildWeeklyProgressReport, renderDailyReportPdf, renderWeeklyReportPdf } from "@/lib/progress/reports";

/** Every generated report export for the authenticated subject, most recent first. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ reports: await context.service.listProgressReportExports() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * Generates a PDF/shareable report (`docs/ROADMAP.md`'s Phase 8 entry): renders the deterministic
 * daily or weekly metrics (`lib/progress/reports.ts`) into a PDF (`lib/progress/pdf.ts`), stores the
 * bytes in the same private object storage as photos/lab documents, then records the metadata row.
 * This route is the only place that ever touches the PDF bytes themselves.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { reportType?: unknown; periodLocalDate?: unknown };
    const reportType = body.reportType;
    const periodLocalDate = body.periodLocalDate;
    if (typeof periodLocalDate !== "string" || !periodLocalDate) return Response.json({ error: "periodLocalDate is required" }, { status: 400 });
    if (reportType !== "daily" && reportType !== "weekly") return Response.json({ error: "reportType must be 'daily' or 'weekly'" }, { status: 400 });

    const measurements = await context.service.listBodyMeasurements();
    const bytes = reportType === "daily"
      ? renderDailyReportPdf(await buildDailyProgressReport(context.runner, context.subject, periodLocalDate, measurements))
      : renderWeeklyReportPdf(await buildWeeklyProgressReport(context.runner, context.subject, periodLocalDate, measurements));

    const storageKey = `${context.subject}/progress-report/${crypto.randomUUID()}.pdf`;
    await getMediaStorage().put(storageKey, bytes, "application/pdf");
    const report = await context.service.recordProgressReportExport({ reportType, periodLocalDate, byteSize: bytes.length, storageKey });
    return Response.json({ report });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
