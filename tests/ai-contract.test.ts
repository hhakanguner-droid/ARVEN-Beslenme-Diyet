import assert from "node:assert/strict";
import test from "node:test";
import {
  parseArvenChatReply, parseLabResultExtraction, parseMealPhotoEstimate, parseMealSuggestion, parseMenuAnalysis,
  parseProductPhotoIdentification, parseWeeklyInsight,
} from "../lib/ai/contracts";

const validSuggestion = {
  schemaVersion: "MealSuggestionV1",
  title: "Dengeli öğün",
  rationale: "Protein ve sebze ağırlıklı bir alternatif.",
  ingredients: [{ foodQuery: "ızgara tavuk göğüsü", portionHint: { measure: "palm", quantity: 1, naturalLabel: "1 avuç içi" } }],
  preparation: ["Izgarada pişir."],
  uncertainty: [],
};

test("AI meal contract accepts canonical natural portion language", () => {
  const parsed = parseMealSuggestion(validSuggestion);
  assert.equal(parsed.ingredients[0]?.portionHint.measure, "palm");
});

test("AI portion label must agree with structured measure, size, and quantity", () => {
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ foodQuery: "çorba", portionHint: { measure: "slice", quantity: 1, naturalLabel: "2 bardak" } }],
  }), /naturalLabel must match structured portion hint/);
  assert.throws(() => parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ foodQuery: "çorba", portionHint: { measure: "bowl", size: "small", quantity: 1, naturalLabel: "1 bardak" } }],
  }), /1 küçük kase/);
  const parsed = parseMealSuggestion({
    ...validSuggestion,
    ingredients: [{ foodQuery: "çorba", portionHint: { measure: "bowl", size: "large", quantity: 1, naturalLabel: "1 büyük kase" } }],
  });
  assert.equal(parsed.ingredients[0]?.portionHint.size, "large");
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
    { ...validSuggestion, rationale: "Bu öğün ११११ kcal içerir." },
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

test("food queries cannot be blank, smuggle quantities, or contain medical-management vocabulary", () => {
  for (const foodQuery of [
    "   ", "120 g tavuk", "４３０ kcal tavuk", "٤٣٠ kcal tavuk", "११११ kcal tavuk", "400 kcal yoğurt", "kalori 430 yoğurt",
    "iki miligram sodyum", "iki kilokalori yoğurt", "2 litre su", "iki mililitre süt",
    "1e3 kcal yoğurt", "1e3 calories chicken", "900 kilocalories yogurt", "800 kilojoules soup",
    "medication", "prescription", "ilaç", "reçete",
  ]) {
    assert.throws(() => parseMealSuggestion({ ...validSuggestion, ingredients: [{ ...validSuggestion.ingredients[0], foodQuery }] }));
  }
});

test("AI meal parser enforces the general no-treatment policy on every narrative surface", () => {
  const unsafe = [
    { ...validSuggestion, title: "Diyabetsin" },
    { ...validSuggestion, rationale: "İlacını bırak." },
    { ...validSuggestion, preparation: ["Warfarini kullan."] },
    { ...validSuggestion, preparation: ["İnsülin kullanman gerekiyor."] },
    { ...validSuggestion, preparation: ["Warfarin alman gerekiyor."] },
    { ...validSuggestion, preparation: ["Switch from ibuprofen to naproxen."] },
    { ...validSuggestion, preparation: ["Stop ibuprofen."] },
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
    "One day was incomplete.", "One meal was missing.", "I skipped breakfast once.", "Dinner was missed twice.",
    "Eleven meals were incomplete.", "Nineteen meals were incomplete.",
    "The eleventh meal was incomplete.", "The third meal was incomplete.", "The twentieth meal was incomplete.",
    "The twenty-first meal was incomplete.",
    "A dozen meals were incomplete.", "A pair of meals were incomplete.", "A couple of meals were incomplete.",
    "Both meals were incomplete.", "A single meal was incomplete.", "A double serving was logged.",
    "Water intake increased onefold.", "Water intake increased twofold.", "Adherence improved threefold.",
  ];
  for (const summary of invalidSummaries) assert.throws(() => parseWeeklyInsight({ schemaVersion: "WeeklyInsightV1", summary, positives: [], areasForImprovement: [], suggestions: [], uncertainty: [] }), /must not contain numeric claims/, summary);
});

test("weekly insight parser enforces the same health policy on all narrative arrays", () => {
  const base = { schemaVersion: "WeeklyInsightV1", summary: "Nitel bir haftalık özet.", positives: [], areasForImprovement: [], suggestions: [], uncertainty: [] };
  assert.throws(() => parseWeeklyInsight({ ...base, summary: "Çölyaksin." }), /non-diagnostic health policy/);
  assert.throws(() => parseWeeklyInsight({ ...base, suggestions: ["İlacını kes."] }), /non-diagnostic health policy/);
  assert.throws(() => parseWeeklyInsight({ ...base, suggestions: ["İnsülin kullanman gerekiyor."] }), /non-diagnostic health policy/);
});

const validChatReply = {
  schemaVersion: "ArvenChatReplyV1",
  reply: "Elbette, sana yardımcı olabilirim.",
  uncertainty: [],
};

test("ARVEN chat reply contract accepts a plain reply with no optional fields", () => {
  const parsed = parseArvenChatReply(validChatReply);
  assert.equal(parsed.reply, validChatReply.reply);
  assert.equal(parsed.mealSuggestion, undefined);
  assert.equal(parsed.proposedWaterAction, undefined);
});

test("ARVEN chat reply accepts an embedded meal suggestion, proposed water action, and memory updates", () => {
  const parsed = parseArvenChatReply({
    ...validChatReply,
    mealSuggestion: validSuggestion,
    proposedWaterAction: { kind: "water-log", milliliters: 250 },
    memoryUpdates: [{ factText: "Kahvaltıda genelde yumurta tercih ediyor.", provenance: "ai-inferred", confidence: "medium" }],
  });
  assert.equal(parsed.mealSuggestion?.title, validSuggestion.title);
  assert.equal(parsed.proposedWaterAction?.milliliters, 250);
  assert.equal(parsed.memoryUpdates?.[0]?.confidence, "medium");
});

test("ARVEN chat reply rejects numeric nutrition claims in the reply text", () => {
  assert.throws(
    () => parseArvenChatReply({ ...validChatReply, reply: "Bugün 1900 kcal aldın." }),
    /numeric nutrition\/weight\/adherence/,
  );
});

test("ARVEN chat reply enforces the non-diagnostic health policy on the reply text", () => {
  assert.throws(() => parseArvenChatReply({ ...validChatReply, reply: "Diyabetsin." }), /non-diagnostic health policy/);
});

test("ARVEN chat reply rejects an out-of-range proposed water action", () => {
  assert.throws(() => parseArvenChatReply({ ...validChatReply, proposedWaterAction: { kind: "water-log", milliliters: 0 } }));
  assert.throws(() => parseArvenChatReply({ ...validChatReply, proposedWaterAction: { kind: "water-log", milliliters: 10000 } }));
});

test("ARVEN chat reply rejects a memory update whose fact text smuggles a numeric nutrition claim", () => {
  assert.throws(() => parseArvenChatReply({
    ...validChatReply,
    memoryUpdates: [{ factText: "Günde 1900 kcal hedefliyor.", provenance: "user-stated", confidence: "high" }],
  }));
});

// Phase 5: vision contracts. Every text/narrative field goes through the same numeric-claim and
// non-diagnostic-health guards as the chat/meal-suggestion/weekly-insight contracts above — the
// only genuinely new thing is a per-item/per-photo PhotoConfidence label.

const validMealPhotoEstimate = {
  schemaVersion: "MealPhotoEstimateV1",
  items: [{ foodQuery: "ızgara tavuk göğüsü", portionHint: { measure: "palm", quantity: 1, naturalLabel: "1 avuç içi" }, confidence: "medium" }],
  overallConfidence: "medium",
  uncertainty: [],
};

test("meal photo estimate accepts a well-formed item list with per-item confidence", () => {
  const parsed = parseMealPhotoEstimate(validMealPhotoEstimate);
  assert.equal(parsed.items[0]?.confidence, "medium");
  assert.equal(parsed.overallConfidence, "medium");
});

test("meal photo estimate requires at least one item and rejects an unknown confidence label", () => {
  assert.throws(() => parseMealPhotoEstimate({ ...validMealPhotoEstimate, items: [] }));
  assert.throws(() => parseMealPhotoEstimate({ ...validMealPhotoEstimate, overallConfidence: "certain" }));
});

test("meal photo estimate still enforces the natural-portion-label and no-numbers rules on its items", () => {
  assert.throws(() => parseMealPhotoEstimate({
    ...validMealPhotoEstimate,
    items: [{ foodQuery: "150 gram tavuk", portionHint: { measure: "palm", quantity: 1, naturalLabel: "1 avuç içi" }, confidence: "high" }],
  }));
});

const validMenuAnalysis = {
  schemaVersion: "MenuAnalysisV1",
  rankedItems: [{ itemName: "Izgara somon", rationale: "Protein ağırlıklı ve yağ dengesi hedefine daha uygun.", fitsGoal: "good-fit" }],
  uncertainty: [],
};

test("menu analysis accepts a ranked list with a qualitative fitsGoal label", () => {
  const parsed = parseMenuAnalysis(validMenuAnalysis);
  assert.equal(parsed.rankedItems[0]?.fitsGoal, "good-fit");
});

test("menu analysis rejects a numeric fit score and enforces the numeric-claim guard on rationale text", () => {
  assert.throws(() => parseMenuAnalysis({ ...validMenuAnalysis, rankedItems: [{ ...validMenuAnalysis.rankedItems[0], fitsGoal: 9 }] }));
  assert.throws(() => parseMenuAnalysis({
    ...validMenuAnalysis,
    rankedItems: [{ ...validMenuAnalysis.rankedItems[0], rationale: "Yaklaşık 450 kalori civarında." }],
  }));
});

const validProductPhotoIdentification = {
  schemaVersion: "ProductPhotoIdentificationV1",
  candidateProductName: "yulaf ezmesi",
  candidateBrand: "Örnek Marka",
  detectedBarcode: "8690000000012",
  confidence: "high",
  uncertainty: [],
};

test("product photo identification accepts a full candidate identity with a valid barcode", () => {
  const parsed = parseProductPhotoIdentification(validProductPhotoIdentification);
  assert.equal(parsed.detectedBarcode, "8690000000012");
});

test("product photo identification allows every candidate field to be null when nothing was legible", () => {
  const parsed = parseProductPhotoIdentification({
    ...validProductPhotoIdentification, candidateProductName: null, candidateBrand: null, detectedBarcode: null,
  });
  assert.equal(parsed.detectedBarcode, null);
});

test("product photo identification rejects a barcode that is not 6 to 14 digits", () => {
  assert.throws(() => parseProductPhotoIdentification({ ...validProductPhotoIdentification, detectedBarcode: "12" }));
  assert.throws(() => parseProductPhotoIdentification({ ...validProductPhotoIdentification, detectedBarcode: "abc123456" }));
});

// Phase 6: lab result extraction. Unlike every contract above, numbers in valueText/unitText/
// referenceRangeText are expected and never rejected — they are the user's own lab report, not an
// AI-authored nutrition claim. Only the non-diagnostic health policy still applies.

const validLabResultExtraction = {
  schemaVersion: "LabResultExtractionV1",
  entries: [{ markerName: "Glukoz", valueText: "95", unitText: "mg/dL", referenceRangeText: "70-100" }],
  uncertainty: [],
};

test("lab result extraction accepts a well-formed transcription, numeric value and all", () => {
  const parsed = parseLabResultExtraction(validLabResultExtraction);
  assert.equal(parsed.entries[0]?.valueText, "95");
  assert.equal(parsed.entries[0]?.unitText, "mg/dL");
});

test("lab result extraction allows unitText and referenceRangeText to be null when the photo did not show them", () => {
  const parsed = parseLabResultExtraction({
    ...validLabResultExtraction,
    entries: [{ markerName: "TSH", valueText: "2.1", unitText: null, referenceRangeText: null }],
  });
  assert.equal(parsed.entries[0]?.unitText, null);
});

test("lab result extraction requires at least one entry and rejects a blank marker name or value", () => {
  assert.throws(() => parseLabResultExtraction({ ...validLabResultExtraction, entries: [] }));
  assert.throws(() => parseLabResultExtraction({
    ...validLabResultExtraction,
    entries: [{ markerName: "   ", valueText: "95", unitText: null, referenceRangeText: null }],
  }));
  assert.throws(() => parseLabResultExtraction({
    ...validLabResultExtraction,
    entries: [{ markerName: "Glukoz", valueText: "", unitText: null, referenceRangeText: null }],
  }));
});

test("lab result extraction still enforces the non-diagnostic health policy on the marker name and uncertainty text", () => {
  assert.throws(() => parseLabResultExtraction({
    ...validLabResultExtraction,
    entries: [{ markerName: "Diyabetsin", valueText: "95", unitText: null, referenceRangeText: null }],
  }), /non-diagnostic health policy/);
  assert.throws(() => parseLabResultExtraction({ ...validLabResultExtraction, uncertainty: ["İlacını bırak."] }), /non-diagnostic health policy/);
});
