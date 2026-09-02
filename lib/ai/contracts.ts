import { z } from "zod";

export const MealSuggestionV1 = z.object({
  schemaVersion: z.literal("MealSuggestionV1"),
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(600),
  ingredients: z.array(z.object({
    foodQuery: z.string().min(1).max(120),
    suggestedGrams: z.number().positive().max(2000),
  })).min(1).max(20),
  preparation: z.array(z.string().min(1).max(300)).max(12),
  uncertainty: z.array(z.string().min(1).max(240)).max(8),
});

export type MealSuggestion = z.infer<typeof MealSuggestionV1>;

/**
 * Deliberately absent from the AI schema: calories, protein, carbohydrate,
 * fat and other nutrient totals. The deterministic nutrition engine resolves
 * suggested ingredients to verified foods and calculates those values itself.
 */
export function parseMealSuggestion(input: unknown): MealSuggestion {
  return MealSuggestionV1.parse(input);
}
