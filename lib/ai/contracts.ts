import { z } from "zod";

const PortionMeasure = z.enum([
  "piece",
  "slice",
  "teaspoon",
  "tablespoon",
  "tea-glass",
  "water-glass",
  "cup",
  "bowl",
  "handful",
  "palm",
  "serving",
  "package",
  "bottle",
  "can",
  "ladle",
]);

const PortionSize = z.enum(["small", "medium", "large"]);
const NUMERIC_NUTRITION_CLAIM = /\p{N}+(?:[.,]\p{N}+)?\s*(?:kcal|kj|kalori|gram|gr|g|mg|mcg|ml|kg)\b/iu;
const ANY_DIGIT = /\p{N}/u;
const NUTRITION_UNIT_WORD = /\b(?:kcal|kj|kalori|gram|gr|g|mg|mcg|ml|kg)\b/iu;
const NUMBER_WORDS = new Set([
  "sifir",
  "iki",
  "uc",
  "dort",
  "bes",
  "alti",
  "yedi",
  "sekiz",
  "dokuz",
  "on",
  "yirmi",
  "otuz",
  "kirk",
  "elli",
  "altmis",
  "yetmis",
  "seksen",
  "doksan",
  "yuz",
  "bin",
  "milyon",
  "milyar",
  "trilyon",
  "yarim",
  "bucuk",
  "ceyrek",
  "yuzde",
  "zero",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "half",
  "quarter",
  "percent",
]);
const TURKISH_NUMBER_SUFFIXES = new Set([
  "i", "u", "a", "e",
  "si", "su",
  "in", "un", "nin", "nun",
  "ini", "unu", "sini", "sunu",
  "ina", "ine", "una", "une", "sina", "sine", "suna", "sune",
  "dan", "den", "tan", "ten",
  "da", "de", "ta", "te",
  "ya", "ye",
  "lar", "ler", "lari", "leri", "larin", "lerin", "lara", "lere",
  "lik", "luk", "inci", "uncu",
]);

function normalizeNumberText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function isWrittenNumberToken(token: string): boolean {
  if (NUMBER_WORDS.has(token)) return true;
  for (const base of NUMBER_WORDS) {
    if (!token.startsWith(base) || token.length <= base.length) continue;
    const suffix = token.slice(base.length);
    if (TURKISH_NUMBER_SUFFIXES.has(suffix)) return true;
  }
  return false;
}

function containsSpelledNumberWord(value: string): boolean {
  return normalizeNumberText(value).split(/\s+/).filter(Boolean).some(isWrittenNumberToken);
}

function containsContextualOneClaim(value: string): boolean {
  const normalized = normalizeNumberText(value);
  return /\b(?:yuzde\s+bir|percent\s+one|bir\s+(?:kcal|kj|kalori|gram|gr|g|mg|mcg|ml|kg|puan|adim|saat|gun|hafta|ogun|porsiyon|kilo|kilogram)|one\s+(?:kcal|kj|calorie|gram|mg|mcg|ml|kg|point|step|hour|day|week))\b/i.test(normalized);
}

function containsWeeklyNumericClaim(value: string): boolean {
  return ANY_DIGIT.test(value) || containsSpelledNumberWord(value) || containsContextualOneClaim(value);
}

function containsSpelledNutritionClaim(value: string): boolean {
  return NUTRITION_UNIT_WORD.test(value)
    && (containsSpelledNumberWord(value) || containsContextualOneClaim(value));
}

function mealNarrative(max: number) {
  return z.string().min(1).max(max).refine(
    (value) => !NUMERIC_NUTRITION_CLAIM.test(value) && !containsSpelledNutritionClaim(value),
    "AI meal text must not contain numeric nutrition/weight claims",
  );
}

function weeklyNarrative(max: number) {
  return z.string().min(1).max(max).refine(
    (value) => !containsWeeklyNumericClaim(value),
    "Weekly narrative must not contain numeric claims; render deterministic metrics separately",
  );
}

const NaturalPortionLabel = z.string().min(1).max(120).refine(
  (value) => !NUMERIC_NUTRITION_CLAIM.test(value) && !containsSpelledNutritionClaim(value),
  "Natural portion labels must not smuggle gram/ml nutrition quantities",
);

const PortionHint = z.object({
  measure: PortionMeasure,
  quantity: z.number().positive().max(20),
  size: PortionSize.optional(),
  naturalLabel: NaturalPortionLabel,
}).strict();

const SuggestedIngredient = z.object({
  foodQuery: z.string().min(1).max(120),
  portionHint: PortionHint,
}).strict();

export const MealSuggestionV1 = z.object({
  schemaVersion: z.literal("MealSuggestionV1"),
  title: mealNarrative(120),
  rationale: mealNarrative(600),
  ingredients: z.array(SuggestedIngredient).min(1).max(20),
  preparation: z.array(mealNarrative(300)).max(12),
  uncertainty: z.array(mealNarrative(240)).max(8),
}).strict();

export type MealSuggestion = z.infer<typeof MealSuggestionV1>;

export const WeeklyInsightV1 = z.object({
  schemaVersion: z.literal("WeeklyInsightV1"),
  summary: weeklyNarrative(900),
  positives: z.array(weeklyNarrative(300)).max(6),
  areasForImprovement: z.array(weeklyNarrative(300)).max(6),
  suggestions: z.array(weeklyNarrative(300)).max(6),
  uncertainty: z.array(weeklyNarrative(240)).max(6),
}).strict();

export type WeeklyInsight = z.infer<typeof WeeklyInsightV1>;

/**
 * Deliberately absent from the AI schema: grams, calories, protein,
 * carbohydrate, fat and other nutrient totals. Strict schemas reject those
 * fields and all user-facing meal text fields reject digit- or word-authored
 * nutrition claims. AI speaks in natural portion language. The server resolves
 * that hint against verified FoodPortionOptions, converts it to grams internally,
 * then calculates nutrition deterministically.
 */
export function parseMealSuggestion(input: unknown): MealSuggestion {
  return MealSuggestionV1.parse(input);
}

/**
 * Weekly numeric metrics (adherence, averages, trends) are computed before the
 * model call and rendered separately. The model output is number-free narrative,
 * including Turkish inflections and contextual one-valued metric claims.
 */
export function parseWeeklyInsight(input: unknown): WeeklyInsight {
  return WeeklyInsightV1.parse(input);
}
