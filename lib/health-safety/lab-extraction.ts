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
}).strict();

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
