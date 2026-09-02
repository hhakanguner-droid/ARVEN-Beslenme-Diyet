import assert from "node:assert/strict";
import test from "node:test";
import { parseMealSuggestion, parseWeeklyInsight } from "../lib/ai/contracts";

const validSuggestion = {
  schemaVersion: "MealSuggestionV1",
  title: "Dengeli öğün",
  rationale: "Protein ve sebze ağırlıklı bir alternatif.",
  ingredients: [{ foodQuery: "ızgara tavuk göğsü", portionHint: { measure: "palm", quantity: 1, naturalLabel: "1 avuç içi" } }],
  preparation: ["Izgarada pişir."],
  uncertainty: [],
};

test("AI meal contract accepts canonical natural portion language", () => {
  const parsed = parseMealSuggestion(validSuggestion);
  assert.equal(parsed.ingredients[0]?.portionHint.measure, "palm");
});

test("AI portion label must agree with structured measure and quantity", () => {
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ foodQuery: "çorba", portionHint: { measure: "slice", quantity: 1, naturalLabel: "2 bardak" } }],
  }), /naturalLabel must match structured portion hint/);
});

test("AI meal contract rejects suggested grams and AI-authored numeric fields", () => {
  assert.throws(() => parseMealSuggestion({ ...validSuggestion, ingredients: [{ ...validSuggestion.ingredients[0], suggestedGrams: 120 }] }));
  assert.throws(() => parseMealSuggestion({ ...validSuggestion, energyKcal: 430 }));
});

test("all user-facing meal text rejects numeric nutrition claims in either order and every Unicode digit script", () => {
  const cases = [
    { ...validSuggestion, rationale: "Bu öğün 430 kcal içerir." },
    { ...validSuggestion, rationale: "Bu öğün ４３０ kcal içerir." },
    { ...validSuggestion, rationale: "Bu öğün ٤٣٠ kcal içerir." },
    { ...validSuggestion, rationale: "Bu öğün ४३० kcal içerir." },
    { ...validSuggestion, rationale: "Bu öğünde kalori 430, protein 30." },
    { ...validSuggestion, rationale: "Kalori: bir." },
    { ...validSuggestion, rationale: "Calories: one." },
    { ...validSuggestion, rationale: "Bu öğün dört yüz kalori içerir." },
    { ...validSuggestion, rationale: "Bu öğün bir gram protein içerir." },
    { ...validSuggestion, rationale: "Bu öğün iki miligram sodyum içerir." },
    { ...validSuggestion, rationale: "Bu öğün 200 mikrogram vitamin içerir." },
    { ...validSuggestion, rationale: "Bu öğün iki kilokalori içerir." },
    { ...validSuggestion, rationale: "Bu içecek 2 litre su içerir." },
    { ...validSuggestion, rationale: "Bu içecek iki mililitre süt içerir." },
    { ...validSuggestion, rationale: "Bu öğün 1e3 kcal içerir." },
    { ...validSuggestion, rationale: "This meal has 1e3 calories." },
    { ...validSuggestion, rationale: "This meal has 900 kilocalories." },
    { ...validSuggestion, rationale: "This meal provides 800 kilojoules." },
    { ...validSuggestion, title: "450 kcal protein öğünü" },
    { ...validSuggestion, title: "Dört yüz kalorilik öğün" },
  ];
  for (const candidate of cases) assert.throws(() => parseMealSuggestion(candidate), /numeric nutrition/, candidate.title);
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ ...validSuggestion.ingredients[0], portionHint: { ...validSuggestion.ingredients[0].portionHint, naturalLabel: "120 g tavuk" } }],
  }), /Natural portion labels/);
});

test("food queries cannot smuggle model-authored quantities", () => {
  for (const foodQuery of [
    "120 g tavuk", "４３０ kcal tavuk", "٤٣٠ kcal tavuk", "४३० kcal tavuk", "400 kcal yoğurt", "kalori 430 yoğurt",
    "iki miligram sodyum", "iki kilokalori yoğurt", "2 litre su", "iki mililitre süt",
    "1e3 kcal yoğurt", "1e3 calories chicken", "900 kilocalories yogurt", "800 kilojoules soup",
  ]) {
    assert.throws(() => parseMealSuggestion({ ...validSuggestion, ingredients: [{ ...validSuggestion.ingredients[0], foodQuery }] }), /Food queries/, foodQuery);
  }
});

test("weekly insight contract accepts qualitative narrative interpretation", () => {
  const parsed = parseWeeklyInsight({
    schemaVersion: "WeeklyInsightV1", summary: "Bu hafta öğün kayıtlarında daha düzenli ritim oluştu.",
    positives: ["Planlanan öğünleri daha düzenli kaydettin."], areasForImprovement: ["Su kaydı bazı günlerde eksik kaldı."],
    suggestions: ["Su kaydını gün içine dağıtmayı deneyebilirsin."], uncertainty: ["Eksik kayıt bulunan günler yorumun güvenini azaltıyor."],
  });
  assert.equal(parsed.positives.length, 1);
});

test("weekly AI insight cannot author numeric truth", () => {
  assert.throws(() => parseWeeklyInsight({ schemaVersion: "WeeklyInsightV1", summary: "Özet", positives: [], areasForImprovement: [], suggestions: [], uncertainty: [], adherenceScore: 82, averageCalories: 1940 }));
  const invalidSummaries = [
    "Uyum puanın %97 ve ortalaman 1900 kcal.", "Uyumun yüzde doksan yedi.", "Ortalaman iki bin kalori civarında.",
    "Hedefin yüzde seksenine yaklaştın.", "Hedefin yüzde bir altında kaldın.", "Ortalaman bir gram protein arttı.",
    "Bu hafta hedefi bir kez aştın.", "Planı bir defa kaçırdın.", "Bu hafta hedefi birer kez aştın.", "Planı bir kereden fazla kaçırdın.",
  ];
  for (const summary of invalidSummaries) assert.throws(() => parseWeeklyInsight({ schemaVersion: "WeeklyInsightV1", summary, positives: [], areasForImprovement: [], suggestions: [], uncertainty: [] }), /must not contain numeric claims/, summary);
});
