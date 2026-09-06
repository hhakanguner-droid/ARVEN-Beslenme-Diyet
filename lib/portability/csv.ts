import type { StoredBodyMeasurement, StoredNutritionEvent } from "@/lib/persistence/v1-boundary";

/** RFC 4180 field quoting: wrap in quotes (doubling any internal quote) whenever the value contains a comma, quote, or newline. */
function csvField(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRows(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

type MealEventItemPayload = { foodName?: string; grams?: number; nutrition?: { energyKcal?: number; proteinG?: number; carbsG?: number; fatG?: number; fiberG?: number | null } };
type MealEventPayload = { schemaVersion: "MealEventV1"; mealType: string; items: MealEventItemPayload[] };
type WaterEventPayload = { schemaVersion: "WaterEventV1"; milliliters: number };

/**
 * Human-readable, one-row-per-logged-food table (`docs/PORTABILITY.md`'s CSV layer — an
 * interchange/report format, not the lossless backup; that's the JSON export). Malformed stored
 * payloads (should never happen, but this reads untyped JSON) are skipped rather than throwing, so
 * one bad historical row cannot break the whole download.
 */
export function mealLogToCsv(events: StoredNutritionEvent[]): string {
  const rows: (string | number | null)[][] = [];
  for (const event of events) {
    let payload: MealEventPayload;
    try { payload = JSON.parse(event.payloadJson) as MealEventPayload; } catch { continue; }
    for (const item of payload.items ?? []) {
      rows.push([
        event.occurredAt, event.localDate, payload.mealType, item.foodName ?? "",
        item.grams ?? "", item.nutrition?.energyKcal ?? "", item.nutrition?.proteinG ?? "",
        item.nutrition?.carbsG ?? "", item.nutrition?.fatG ?? "", item.nutrition?.fiberG ?? "",
      ]);
    }
  }
  return csvRows(
    ["occurredAt", "localDate", "mealType", "foodName", "grams", "energyKcal", "proteinG", "carbsG", "fatG", "fiberG"],
    rows,
  );
}

export function waterLogToCsv(events: StoredNutritionEvent[]): string {
  const rows: (string | number | null)[][] = [];
  for (const event of events) {
    let payload: WaterEventPayload;
    try { payload = JSON.parse(event.payloadJson) as WaterEventPayload; } catch { continue; }
    rows.push([event.occurredAt, event.localDate, payload.milliliters]);
  }
  return csvRows(["occurredAt", "localDate", "milliliters"], rows);
}

export function measurementsToCsv(measurements: StoredBodyMeasurement[]): string {
  const rows = measurements.map((m): (string | number | null)[] => [
    m.localDate, m.weightKg, m.bodyFatPercent, m.waistCm, m.hipCm, m.chestCm, m.note,
  ]);
  return csvRows(["localDate", "weightKg", "bodyFatPercent", "waistCm", "hipCm", "chestCm", "note"], rows);
}
