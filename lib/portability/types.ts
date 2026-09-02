export const ARVEN_EXPORT_FORMAT = "ArvenNutritionExportV1" as const;

export const EXPORT_SECTIONS = [
  "profile",
  "goals",
  "preferences",
  "meal-log",
  "water-log",
  "measurements",
  "recipes",
  "custom-foods",
  "ai-memory",
  "media-manifest",
] as const;

export type ExportSection = typeof EXPORT_SECTIONS[number];

export type ExportManifest = {
  format: typeof ARVEN_EXPORT_FORMAT;
  exportedAt: string;
  locale: string;
  timezone: string;
  sections: readonly ExportSection[];
  /** Number of logical records by section, useful for import verification. */
  recordCounts: Partial<Record<ExportSection, number>>;
};

const EXPORT_SECTION_SET = new Set<string>(EXPORT_SECTIONS);

/**
 * Validates decoded/untrusted JSON at runtime. Compile-time unions are not a
 * security boundary for imported files, so every section identifier is checked
 * against the explicit V1 allowlist.
 */
export function validateExportManifest(manifest: unknown): asserts manifest is ExportManifest {
  if (typeof manifest !== "object" || manifest == null || Array.isArray(manifest)) {
    throw new Error("Export manifest must be an object");
  }

  const candidate = manifest as Record<string, unknown>;
  if (candidate.format !== ARVEN_EXPORT_FORMAT) throw new Error("Unsupported ARVEN export format");
  if (typeof candidate.exportedAt !== "string" || !Number.isFinite(Date.parse(candidate.exportedAt))) {
    throw new Error("exportedAt must be a valid timestamp");
  }
  if (typeof candidate.locale !== "string" || !candidate.locale.trim()) throw new Error("locale is required");
  if (typeof candidate.timezone !== "string" || !candidate.timezone.trim()) throw new Error("timezone is required");
  if (!Array.isArray(candidate.sections)) throw new Error("sections must be an array");

  const seen = new Set<ExportSection>();
  for (const rawSection of candidate.sections) {
    if (typeof rawSection !== "string" || !EXPORT_SECTION_SET.has(rawSection)) {
      throw new Error(`Unsupported export section: ${String(rawSection)}`);
    }
    const section = rawSection as ExportSection;
    if (seen.has(section)) throw new Error(`Duplicate export section: ${section}`);
    seen.add(section);
  }

  const rawCounts = candidate.recordCounts;
  if (typeof rawCounts !== "object" || rawCounts == null || Array.isArray(rawCounts)) {
    throw new Error("recordCounts must be an object");
  }

  for (const [rawSection, rawCount] of Object.entries(rawCounts)) {
    if (!EXPORT_SECTION_SET.has(rawSection)) {
      throw new Error(`Unsupported record-count section: ${rawSection}`);
    }
    if (!seen.has(rawSection as ExportSection)) {
      throw new Error(`Record count supplied for undeclared section: ${rawSection}`);
    }
    if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 0) {
      throw new Error(`Invalid record count for ${rawSection}`);
    }
  }
}
