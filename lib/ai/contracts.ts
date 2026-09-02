import { z } from "zod";
import { assertNoMedicalOverreach } from "@/lib/health-safety/policy";

const PortionMeasure = z.enum([
  "piece", "slice", "teaspoon", "tablespoon", "tea-glass", "water-glass", "cup", "bowl",
  "handful", "palm", "serving", "package", "bottle", "can", "ladle",
]);
const PortionSize = z.enum(["small", "medium", "large"]);
const ANY_DIGIT = /\p{N}/u;
const NUMBER_WORDS = new Set([
  "sifir", "iki", "uc", "dort", "bes", "alti", "yedi", "sekiz", "dokuz", "on", "yirmi", "otuz",
  "kirk", "elli", "altmis", "yetmis", "seksen", "doksan", "yuz", "bin", "milyon", "milyar", "trilyon",
  "yarim", "bucuk", "ceyrek", "yuzde", "zero", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
  "thousand", "million", "billion", "half", "quarter", "percent",
]);
const TURKISH_NUMBER_SUFFIXES = new Set([
  "i", "u", "a", "e", "si", "su", "in", "un", "nin", "nun", "ini", "unu", "sini", "sunu", "ina", "ine",
  "una", "une", "sina", "sine", "suna", "sune", "dan", "den", "tan", "ten", "da", "de", "ta", "te", "ya",
  "ye", "lar", "ler", "lari", "leri", "larin", "lerin", "lara", "lere", "lik", "luk", "inci", "uncu",
]);
const NUTRITION_UNIT_PATTERN = "(?:kcal|kilokalori[a-z]*|kilocalorie[a-z]*|calorie[a-z]*|calories|kj|kilojul[a-z]*|kilojoule[a-z]*|kalori[a-z]*|gram[a-z]*|miligram[a-z]*|mikrogram[a-z]*|mililitre[a-z]*|millilitre[a-z]*|litre[a-z]*|milligram[a-z]*|microgram[a-z]*|milliliter[a-z]*|liter[a-z]*|gr|g|mg|mcg|ml|kg|l)";
const NUTRITION_METRIC_PATTERN = "(?:kalori|kcal|enerji|protein|karbonhidrat|karb|yag|lif|fiber|sodyum|tuz|seker|calorie|calories|energy|carb|carbs|fat|sodium|sugar)";
const MEASURE_LABELS: Record<z.infer<typeof PortionMeasure>, string> = {
  piece: "adet", slice: "dilim", teaspoon: "çay kaşığı", tablespoon: "yemek kaşığı", "tea-glass": "çay bardağı",
  "water-glass": "su bardağı", cup: "fincan", bowl: "kase", handful: "avuç", palm: "avuç içi", serving: "porsiyon",
  package: "paket", bottle: "şişe", can: "kutu", ladle: "kepçe",
};

function normalizeNumberText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c")
    .replace(/ö/g, "o").replace(/ü/g, "u").replace(/[^a-z0-9\p{N}\s.,+\-]/gu, " ").replace(/\s+/g, " ");
}
function isWrittenNumberToken(token: string): boolean {
  if (NUMBER_WORDS.has(token)) return true;
  for (const base of NUMBER_WORDS) {
    if (!token.startsWith(base) || token.length <= base.length) continue;
    if (TURKISH_NUMBER_SUFFIXES.has(token.slice(base.length))) return true;
  }
  return false;
}
function containsSpelledNumberWord(value: string): boolean {
  return normalizeNumberText(value).split(/[^a-z0-9]+/).filter(Boolean).some(isWrittenNumberToken);
}
function containsContextualOneClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  const unitOrMetric = `${NUTRITION_UNIT_PATTERN}|${NUTRITION_METRIC_PATTERN}|puan|adim|saat|gun|hafta|ogun|porsiyon|kilo|kilogram`;
  const directOne = new RegExp(`\\b(?:yuzde\\s+bir|percent\\s+one|bir\\s+(?:${unitOrMetric})|one\\s+(?:${unitOrMetric})|(?:${unitOrMetric})\\s*:?\\s*(?:bir|one))\\b`, "i");
  const frequencyOne = /\bbir(?:er)?\s+(?:kez|defa|kere)(?:den|dan|ten|tan|de|da|ye|ya)?\b/i;
  return directOne.test(normalized) || frequencyOne.test(normalized);
}
function containsDigitNutritionClaim(value: string): boolean {
  if (!ANY_DIGIT.test(value)) return false;
  const normalized = normalizeNumberText(value);
  return new RegExp(`\\b(?:${NUTRITION_UNIT_PATTERN}|${NUTRITION_METRIC_PATTERN})\\b`, "i").test(normalized);
}
function containsSpelledNutritionClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  return new RegExp(`\\b(?:${NUTRITION_UNIT_PATTERN}|${NUTRITION_METRIC_PATTERN})\\b`, "i").test(normalized)
    && (containsSpelledNumberWord(normalized) || containsContextualOneClaim(normalized));
}
function containsWeeklyNumericClaim(value: string): boolean {
  return ANY_DIGIT.test(value) || containsSpelledNumberWord(value) || containsContextualOneClaim(value);
}
function assertSafeNarrative(value: string): boolean {
  try { assertNoMedicalOverreach(value); return true; }
  catch { return false; }
}
function mealNarrative(max: number) {
  return z.string().min(1).max(max)
    .refine((value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
      "AI meal text must not contain numeric nutrition/weight claims")
    .refine(assertSafeNarrative, "AI output violates ARVEN non-diagnostic health policy");
}
function weeklyNarrative(max: number) {
  return z.string().min(1).max(max)
    .refine((value) => !containsWeeklyNumericClaim(value),
      "Weekly narrative must not contain numeric claims; render deterministic metrics separately")
    .refine(assertSafeNarrative, "AI output violates ARVEN non-diagnostic health policy");
}
const NaturalPortionLabel = z.string().min(1).max(120).refine(
  (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
  "Natural portion labels must not smuggle gram/ml nutrition quantities",
);
const FoodQuery = z.string().min(1).max(120).refine(
  (value) => !containsDigitNutritionClaim(value) && !containsSpelledNutritionClaim(value),
  "Food queries must not contain model-authored gram or nutrition quantities",
);
function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100).replace(".", ",");
}
function canonicalHintLabel(measure: z.infer<typeof PortionMeasure>, quantity: number): string {
  return `${formatQuantity(quantity)} ${MEASURE_LABELS[measure]}`;
}
const PortionHint = z.object({ measure: PortionMeasure, quantity: z.number().positive().max(20), size: PortionSize.optional(), naturalLabel: NaturalPortionLabel }).strict().superRefine((value, ctx) => {
  const expected = canonicalHintLabel(value.measure, value.quantity).toLocaleLowerCase("tr-TR");
  if (value.naturalLabel.trim().toLocaleLowerCase("tr-TR") !== expected) {
    ctx.addIssue({ code: "custom", path: ["naturalLabel"], message: `naturalLabel must match structured portion hint (${expected})` });
  }
});
const SuggestedIngredient = z.object({ foodQuery: FoodQuery, portionHint: PortionHint }).strict();
export const MealSuggestionV1 = z.object({
  schemaVersion: z.literal("MealSuggestionV1"), title: mealNarrative(120), rationale: mealNarrative(600),
  ingredients: z.array(SuggestedIngredient).min(1).max(20), preparation: z.array(mealNarrative(300)).max(12), uncertainty: z.array(mealNarrative(240)).max(8),
}).strict();
export type MealSuggestion = z.infer<typeof MealSuggestionV1>;
export const WeeklyInsightV1 = z.object({
  schemaVersion: z.literal("WeeklyInsightV1"), summary: weeklyNarrative(900), positives: z.array(weeklyNarrative(300)).max(6),
  areasForImprovement: z.array(weeklyNarrative(300)).max(6), suggestions: z.array(weeklyNarrative(300)).max(6), uncertainty: z.array(weeklyNarrative(240)).max(6),
}).strict();
export type WeeklyInsight = z.infer<typeof WeeklyInsightV1>;
export function parseMealSuggestion(input: unknown): MealSuggestion { return MealSuggestionV1.parse(input); }
export function parseWeeklyInsight(input: unknown): WeeklyInsight { return WeeklyInsightV1.parse(input); }
