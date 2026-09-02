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
const SPELLED_NUMBER_WORD = /\b(?:sıfır|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|trilyon|yarım|buçuk|çeyrek|zero|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|quarter)\b/iu;
const AMBIGUOUS_ONE_NUMERIC_CONTEXT = /\b(?:yüzde\s+bir|bir\s+(?:kcal|kj|kalori|gram|gr|g|mg|mcg|ml|kg|yüz|bin|milyon|milyar|trilyon|percent|puan))\b/iu;
const SPELLED_NUMERIC_NUTRITION_CLAIM = /\b(?:sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|trilyon|yarım|buçuk|çeyrek)(?:\s+(?:sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|trilyon|yarım|buçuk|çeyrek))*\s*(?:kcal|kj|kalori|gram|gr|g|mg|mcg|ml|kg)\b/iu;

function containsWeeklyNumericClaim(value: string): boolean {
  return ANY_DIGIT.test(value)
    || SPELLED_NUMBER_WORD.test(value)
    || AMBIGUOUS_ONE_NUMERIC_CONTEXT.test(value);
}

function mealNarrative(max: number) {
  return z.string().min(1).max(max).refine(
    (value) => !NUMERIC_NUTRITION_CLAIM.test(value) && !SPELLED_NUMERIC_NUTRITION_CLAIM.test(value),
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
  (value) => !NUMERIC_NUTRITION_CLAIM.test(value) && !SPELLED_NUMERIC_NUTRITION_CLAIM.test(value),
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
  title: z.string().min(1).max(120),
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
 * fields and narrative validators reject digit- or word-authored nutrition
 * claims inside text. AI speaks in natural portion language. The server
 * resolves that hint against verified FoodPortionOptions, converts it to grams
 * internally, then calculates nutrition deterministically.
 */
export function parseMealSuggestion(input: unknown): MealSuggestion {
  return MealSuggestionV1.parse(input);
}

/**
 * Weekly numeric metrics (adherence, averages, trends) are computed before the
 * model call and rendered separately. The model output is number-free narrative
 * including spelled-out quantities such as "yüzde doksan" or "iki bin".
 */
export function parseWeeklyInsight(input: unknown): WeeklyInsight {
  return WeeklyInsightV1.parse(input);
}
