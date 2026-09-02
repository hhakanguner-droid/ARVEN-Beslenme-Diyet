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

test("AI portion quantities must be exactly representable by the visible label", () => {
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ foodQuery: "badem", portionHint: { measure: "palm", quantity: 0.004, naturalLabel: "0 avuç içi" } }],
  }), /0.01 increments/);
  const parsed = parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ foodQuery: "badem", portionHint: { measure: "palm", quantity: 0.25, naturalLabel: "0,25 avuç içi" } }],
  });
  assert.equal(parsed.ingredients[0]?.portionHint.quantity, 0.25);
});

test("AI meal contract rejects suggested grams and AI-authored numeric fields", () => {
  assert.throws(() => parseMealSuggestion({ ...validSuggestion, ingredients: [{ ...validSuggestion.ingredients[0], suggestedGrams: 120 }] }));
  assert.throws(() => parseMealSuggestion({ ...validSuggestion, energyKcal: 430 }));
});

test("all user-facing meal text rejects numeric deterministic claims", () => {
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
    { ...validSuggestion, rationale: "Hedef kilon 70 olacak." },
    { ...validSuggestion, rationale: "Plan uyumun 90." },
    { ...validSuggestion, rationale: "Target weight 75." },
    { ...validSuggestion, rationale: "Adherence 88." },
    { ...validSuggestion, title: "450 kcal protein öğünü" },
    { ...validSuggestion, title: "Dört yüz kalorilik öğün" },
  ];
  for (const candidate of cases) assert.throws(() => parseMealSuggestion(candidate), /numeric nutrition\/weight\/adherence/, candidate.title);
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ ...validSuggestion.ingredients[0], portionHint: { ...validSuggestion.ingredients[0].portionHint, naturalLabel: "120 g tavuk" } }],
  }), /Natural portion labels/);
});

test("food queries cannot be blank or smuggle model-authored quantities", () => {
  for (const foodQuery of [
    "   ", "120 g tavuk", "４３０ kcal tavuk", "٤٣٠ kcal tavuk", "४३० kcal tavuk", "400 kcal yoğurt", "kalori 430 yoğurt",
    "iki miligram sodyum", "iki kilokalori yoğurt", "2 litre su", "iki mililitre süt",
    "1e3 kcal yoğurt", "1e3 calories chicken", "900 kilocalories yogurt", "800 kilojoules soup",
  ]) {
    assert.throws(() => parseMealSuggestion({ ...validSuggestion, ingredients: [{ ...validSuggestion.ingredients[0], foodQuery }] }), undefined, foodQuery);
  }
});

test("AI meal parser enforces non-diagnostic and non-medication policy on every narrative surface", () => {
  const unsafe = [
    { ...validSuggestion, title: "Diyabetsin" },
    { ...validSuggestion, rationale: "İlacını bırak." },
    { ...validSuggestion, preparation: ["Warfarini kullan."] },
    { ...validSuggestion, preparation: ["İnsülin kullanman gerekiyor."] },
    { ...validSuggestion, preparation: ["Warfarin alman gerekiyor."] },
    { ...validSuggestion, uncertainty: ["Sende kanser var."] },
  ];
  for (const candidate of unsafe) {
    assert.throws(() => parseMealSuggestion(candidate), /non-diagnostic health policy/);
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

test("weekly insight parser enforces the same health policy on all narrative arrays", () => {
  const base = { schemaVersion: "WeeklyInsightV1", summary: "Nitel bir haftalık özet.", positives: [], areasForImprovement: [], suggestions: [], uncertainty: [] };
  assert.throws(() => parseWeeklyInsight({ ...base, summary: "Çölyaksın." }), /non-diagnostic health policy/);
  assert.throws(() => parseWeeklyInsight({ ...base, suggestions: ["İlacını kes."] }), /non-diagnostic health policy/);
  assert.throws(() => parseWeeklyInsight({ ...base, suggestions: ["İnsülin kullanman gerekiyor."] }), /non-diagnostic health policy/);
});
