import { z } from "zod";
import { assertNoMedicalOverreach } from "@/lib/health-safety/policy";

function safeText(max: number) {
  return z.string().trim().min(1).max(max).refine((value) => {
    try {
      assertNoMedicalOverreach(value);
      return true;
    } catch {
      return false;
    }
  }, "AI-authored lab text violates ARVEN non-diagnostic health policy");
}

// Keep lab values permissive enough for real report notation (e.g. <5, 4.2, Negative)
// while still applying the medical-overreach boundary to every model-controlled string.
const SafeLabEntry = z.object({
  markerName: safeText(160),
  valueText: safeText(80),
  unitText: safeText(40).nullable(),
  referenceRangeText: safeText(80).nullable(),
}).strict().superRefine((entry, ctx) => {
  // Fields are rendered together in the product, so validate the composed representation too.
  // This prevents hostile output from splitting a diagnosis/treatment sentence across schema fields.
  const combined = [entry.markerName, entry.valueText, entry.unitText, entry.referenceRangeText]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  try {
    assertNoMedicalOverreach(combined);
  } catch {
    ctx.addIssue({ code: "custom", message: "Combined AI-authored lab entry violates ARVEN non-diagnostic health policy" });
  }
});

const SafeLabExtraction = z.object({
  entries: z.array(SafeLabEntry).max(200),
  uncertainty: z.array(safeText(240)).max(20).default([]),
}).passthrough();

export type SafeLabExtraction = z.infer<typeof SafeLabExtraction>;

/**
 * Treat vision-model output as hostile input. This is deliberately a second validation layer
 * after the provider contract so prompt-injected images or provider regressions cannot smuggle
 * diagnosis/treatment/medication text through value/unit/range fields.
 */
export function parseSafeLabExtraction(input: unknown): SafeLabExtraction {
  return SafeLabExtraction.parse(input);
}
