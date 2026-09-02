export const ARVEN_EXPORT_FORMAT = "ArvenNutritionExportV1" as const;

export type ExportSection =
  | "profile"
  | "goals"
  | "preferences"
  | "meal-log"
  | "water-log"
  | "measurements"
  | "recipes"
  | "custom-foods"
  | "ai-memory"
  | "media-manifest";

export type ExportManifest = {
  format: typeof ARVEN_EXPORT_FORMAT;
  exportedAt: string;
  locale: string;
  timezone: string;
  sections: readonly ExportSection[];
  /** Number of logical records by section, useful for import verification. */
  recordCounts: Partial<Record<ExportSection, number>>;
};

export function validateExportManifest(manifest: ExportManifest): void {
  if (manifest.format !== ARVEN_EXPORT_FORMAT) throw new Error("Unsupported ARVEN export format");
  if (!Number.isFinite(Date.parse(manifest.exportedAt))) throw new Error("exportedAt must be a valid timestamp");
  if (!manifest.locale.trim()) throw new Error("locale is required");
  if (!manifest.timezone.trim()) throw new Error("timezone is required");

  const seen = new Set<ExportSection>();
  for (const section of manifest.sections) {
    if (seen.has(section)) throw new Error(`Duplicate export section: ${section}`);
    seen.add(section);
    const count = manifest.recordCounts[section];
    if (count != null && (!Number.isInteger(count) || count < 0)) {
      throw new Error(`Invalid record count for ${section}`);
    }
  }
}
