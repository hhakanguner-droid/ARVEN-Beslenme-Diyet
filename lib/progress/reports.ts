import { renderSimplePdf, type PdfTextLine } from "@/lib/progress/pdf";
import { computeWeeklyMetrics, type WeeklyMetricsV1 } from "@/lib/nutrition/weekly-metrics";
import { V1NutritionReadRepository } from "@/lib/persistence/read-repositories";
import type { StoredBodyMeasurement, V1TransactionRunner } from "@/lib/persistence/v1-boundary";

/**
 * Deterministic daily/weekly progress reports (Faz 8) — every number here comes from the same
 * deterministic sources `Bugün`/`WeeklyMetricsV1` already use (never from the AI provider), plus
 * this subject's own body-measurement history. `lib/progress/pdf.ts` is what turns these into a
 * downloadable/shareable file; this module only computes the numbers.
 */

export type DailyProgressReportV1 = {
  schemaVersion: "DailyProgressReportV1";
  localDate: string;
  consumed: { energyKcal: number; proteinG: number; carbsG: number; fatG: number };
  targets: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; waterMl: number } | null;
  waterMl: number;
  measurement: StoredBodyMeasurement | null;
};

export async function buildDailyProgressReport(
  runner: V1TransactionRunner,
  subject: string,
  localDate: string,
  measurements: StoredBodyMeasurement[],
): Promise<DailyProgressReportV1> {
  const repository = new V1NutritionReadRepository(runner);
  const snapshot = await repository.getDailySnapshot(subject, localDate);
  const measurement = measurements.find((m) => m.localDate === localDate) ?? null;
  return {
    schemaVersion: "DailyProgressReportV1",
    localDate,
    consumed: { energyKcal: snapshot.consumed.energyKcal, proteinG: snapshot.consumed.proteinG, carbsG: snapshot.consumed.carbsG, fatG: snapshot.consumed.fatG },
    targets: snapshot.targets ? { energyKcal: snapshot.targets.energyKcal, proteinG: snapshot.targets.proteinG, carbsG: snapshot.targets.carbsG, fatG: snapshot.targets.fatG, waterMl: snapshot.targets.waterMl ?? 0 } : null,
    waterMl: snapshot.waterMl,
    measurement,
  };
}

export type WeeklyProgressReportV1 = {
  schemaVersion: "WeeklyProgressReportV1";
  metrics: WeeklyMetricsV1;
  weightChangeKg: number | null;
  measurementsInWeek: StoredBodyMeasurement[];
};

export async function buildWeeklyProgressReport(
  runner: V1TransactionRunner,
  subject: string,
  weekStartLocalDate: string,
  measurements: StoredBodyMeasurement[],
): Promise<WeeklyProgressReportV1> {
  const metrics = await computeWeeklyMetrics(runner, subject, weekStartLocalDate);
  const inWeek = measurements
    .filter((m) => m.localDate >= metrics.weekStartLocalDate && m.localDate <= metrics.weekEndLocalDate)
    .slice()
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const withWeight = inWeek.filter((m) => m.weightKg != null);
  const weightChangeKg = withWeight.length >= 2 ? Math.round((withWeight[withWeight.length - 1].weightKg! - withWeight[0].weightKg!) * 10) / 10 : null;
  return { schemaVersion: "WeeklyProgressReportV1", metrics, weightChangeKg, measurementsInWeek: inWeek };
}

function formatNumber(value: number | null): string {
  return value == null ? "—" : String(value);
}

/** "Günlük rapor" PDF: today's (or any past day's) consumed vs. target macros plus that day's measurement, if any. */
export function renderDailyReportPdf(report: DailyProgressReportV1): Uint8Array {
  const lines: PdfTextLine[] = [
    { text: `Tarih: ${report.localDate}`, bold: true },
    { text: "" },
    { text: "Tüketilen", bold: true },
    { text: `Enerji: ${formatNumber(report.consumed.energyKcal)} kcal` },
    { text: `Protein: ${formatNumber(report.consumed.proteinG)} g` },
    { text: `Karbonhidrat: ${formatNumber(report.consumed.carbsG)} g` },
    { text: `Yağ: ${formatNumber(report.consumed.fatG)} g` },
    { text: `Su: ${formatNumber(report.waterMl)} ml` },
  ];
  if (report.targets) {
    lines.push(
      { text: "" },
      { text: "Hedef", bold: true },
      { text: `Enerji: ${formatNumber(report.targets.energyKcal)} kcal` },
      { text: `Protein: ${formatNumber(report.targets.proteinG)} g` },
      { text: `Karbonhidrat: ${formatNumber(report.targets.carbsG)} g` },
      { text: `Yağ: ${formatNumber(report.targets.fatG)} g` },
      { text: `Su: ${formatNumber(report.targets.waterMl)} ml` },
    );
  }
  if (report.measurement) {
    lines.push({ text: "" }, { text: "Ölçüm", bold: true });
    if (report.measurement.weightKg != null) lines.push({ text: `Kilo: ${report.measurement.weightKg} kg` });
    if (report.measurement.bodyFatPercent != null) lines.push({ text: `Vücut yağ oranı: %${report.measurement.bodyFatPercent}` });
    if (report.measurement.waistCm != null) lines.push({ text: `Bel: ${report.measurement.waistCm} cm` });
    if (report.measurement.hipCm != null) lines.push({ text: `Kalça: ${report.measurement.hipCm} cm` });
    if (report.measurement.chestCm != null) lines.push({ text: `Göğüs: ${report.measurement.chestCm} cm` });
  }
  return renderSimplePdf("ARVEN Günlük Rapor", lines);
}

/** "Haftalık rapor" PDF: the same deterministic `WeeklyMetricsV1` behind the weekly insight, plus the week's weight change if two or more weigh-ins exist. */
export function renderWeeklyReportPdf(report: WeeklyProgressReportV1): Uint8Array {
  const { metrics } = report;
  const lines: PdfTextLine[] = [
    { text: `Hafta: ${metrics.weekStartLocalDate} – ${metrics.weekEndLocalDate}`, bold: true },
    { text: "" },
    { text: "Beslenme uyumu", bold: true },
    { text: `Besin kaydı yapılan gün sayısı: ${metrics.daysWithLoggedFood} / 7` },
    { text: `Ortalama enerji: ${formatNumber(metrics.averageEnergyKcal)} kcal` },
    { text: `Ortalama protein: ${formatNumber(metrics.averageProteinG)} g` },
    { text: `Ortalama karbonhidrat: ${formatNumber(metrics.averageCarbsG)} g` },
    { text: `Ortalama yağ: ${formatNumber(metrics.averageFatG)} g` },
    { text: `Ortalama su: ${formatNumber(metrics.averageWaterMl)} ml` },
  ];
  if (metrics.daysWaterGoalMet != null) lines.push({ text: `Su hedefine ulaşılan gün sayısı: ${metrics.daysWaterGoalMet} / 7` });
  lines.push({ text: "" }, { text: "Ölçüm", bold: true });
  lines.push({ text: report.weightChangeKg == null ? "Bu hafta karşılaştırılacak yeterli kilo ölçümü yok." : `Kilo değişimi: ${report.weightChangeKg > 0 ? "+" : ""}${report.weightChangeKg} kg` });
  return renderSimplePdf("ARVEN Haftalık Rapor", lines);
}
