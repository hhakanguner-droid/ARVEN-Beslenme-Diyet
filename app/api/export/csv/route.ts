import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { mealLogToCsv, measurementsToCsv, waterLogToCsv } from "@/lib/portability/csv";

const SECTIONS = ["meal-log", "water-log", "measurements"] as const;
type CsvSection = typeof SECTIONS[number];

/**
 * Human-readable table export (`docs/PORTABILITY.md`'s CSV layer) for one section at a time —
 * `?section=meal-log|water-log|measurements`. This is an interchange/report format, not the
 * lossless backup; `/api/export` (JSON) is what a real restore should use.
 */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const section = new URL(request.url).searchParams.get("section") as CsvSection | null;
    if (!section || !SECTIONS.includes(section)) {
      return Response.json({ error: `section, şunlardan biri olmalı: ${SECTIONS.join(", ")}` }, { status: 400 });
    }

    let csv: string;
    if (section === "measurements") {
      csv = measurementsToCsv(await context.service.listBodyMeasurements());
    } else {
      const events = await context.service.listAllNutritionEvents();
      csv = section === "meal-log"
        ? mealLogToCsv(events.filter((e) => e.eventType === "meal-log"))
        : waterLogToCsv(events.filter((e) => e.eventType === "water-log"));
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="arven-${section}-${context.todayLocalDate}.csv"`,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
