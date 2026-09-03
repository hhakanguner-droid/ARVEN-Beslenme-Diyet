import assert from "node:assert/strict";
import test from "node:test";
import { assertNoAllergyConflict, assertNoDietaryExclusionConflict, assertNoMedicalOverreach } from "../lib/health-safety/policy";

test("allergy conflicts use verified allergen identifiers rather than food names", () => {
  assert.throws(() => assertNoAllergyConflict([{ foodId: "yogurt-1", foodName: "Yoğurt", allergenDataStatus: "verified", allergenIds: ["milk"] }], ["milk"]), /Allergy conflict/);
  assert.throws(() => assertNoAllergyConflict([{ foodId: "tahini-1", foodName: "Tahin", allergenDataStatus: "verified", allergenIds: ["sesame"] }], ["sesame"]), /Allergy conflict/);
});

test("unknown and unrestricted not-applicable allergen data fail closed for active allergies", () => {
  for (const allergenDataStatus of ["unknown", "not-applicable"] as const) {
    assert.throws(() => assertNoAllergyConflict([
      { foodId: "candidate", foodName: "Kaynağı belirsiz ürün", allergenDataStatus, allergenIds: [] },
    ], ["milk"]), /unresolved/);
  }
});

test("malformed or unresolved active allergen exclusions fail closed", () => {
  const candidate = [{ foodId: "zucchini-1", foodName: "Izgara kabak", allergenDataStatus: "verified" as const, allergenIds: [] }];
  assert.throws(() => assertNoAllergyConflict(candidate, ["   "]), /unresolved/);
  assert.throws(() => assertNoAllergyConflict(candidate, [{ id: null, label: "Kullanıcının aktif alerjeni", resolutionStatus: "unresolved" }]), /active allergen unresolved/);
  assert.throws(() => assertNoAllergyConflict([{ foodId: "mystery-1", foodName: "Belirsiz etiket", allergenDataStatus: "verified", allergenIds: ["   "] }], ["milk"]), /unresolved/);
});

test("verified non-conflicting food is allowed", () => {
  assert.doesNotThrow(() => assertNoAllergyConflict([{ foodId: "zucchini-1", foodName: "Izgara kabak", allergenDataStatus: "verified", allergenIds: [] }], ["milk"]));
});

test("AI medication or treatment management is blocked without a medication registry", () => {
  const unsafe = [
    "Bu durumda ilacı bırak.", "Dozu azalt.", "Medikasyonu değiştir.", "Tedaviyi durdur.",
    "Metformini artık alma.", "Metformin dozunu atla.", "Euthyrox kullanımını sürdür.",
    "Aspirin kullanmalısın.", "Metformini almalısın.", "Aspirin'i bırak.", "Metformin'e başla.",
    "Warfarini bırak.", "İnsülini azalt.", "Antibiyotiği kes.",
    "Warfarini bırak ve sebze ye.", "Warfarini bırak; etkileşim riski var.", "Warfarini sebze ile kullan.",
    "Warfarini kullan sebzeyi azalt.",
    "Bunu ilacın yerine kullanmamalısın.", "Bu ilacı kullanman gerekiyor.",
    "Stop taking your medication.", "Reduce your dose.", "Start insulin.", "Take metformin every day.",
    "Stop taking ibuprofen.", "Start taking naproxen.", "Resume using atorvastatin.",
  ];
  for (const message of unsafe) assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  assert.doesNotThrow(() => assertNoMedicalOverreach("Bu sonuçları bir sağlık profesyoneliyle değerlendirmen uygun olur."));
  assert.doesNotThrow(() => assertNoMedicalOverreach("Stop using olive oil."));
});

test("ordinary nutrition commands are not mistaken for medication management", () => {
  for (const message of ["Meyve al.", "Zeytinyağı kullan.", "Ekmeği kes.", "Tuzu azalt.", "Porsiyonu azalt.", "Suyu artır."]) {
    assert.doesNotThrow(() => assertNoMedicalOverreach(message), message);
  }
});

test("direct diagnosis assertions are rejected without blocking ordinary coaching predicates", () => {
  const unsafe = [
    "Sende diyabet var.", "Diyabetin var.", "Bu belirtiler çölyak olduğunu gösteriyor.", "Bu değerlere göre teşhisin kesin.",
    "Diyabet hastasısın.", "Sen çölyaksın.", "Bu diyabettir.", "Diyabetsin.", "Çölyaksın.",
    "Kanserlisin.", "Depresyondasın.", "Astımlısın.", "Parkinsonlusun.", "Endometriozisin.",
    "Sende kanser var.", "Sende lösemi var.", "Bu sonuçlar melanom olduğunu gösteriyor.", "Bu kanserdir.",
  ];
  for (const message of unsafe) assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  for (const message of ["Sen kararlısın.", "Bu dengelidir.", "Bu doğrudur.", "Yeni tatlarla tanışmalısın.", "Bu iş için diplomalısın."]) {
    assert.doesNotThrow(() => assertNoMedicalOverreach(message), message);
  }
});

test("English diagnostic assertions fail closed at the same AI health boundary", () => {
  for (const message of [
    "You have diabetes.",
    "You're diabetic.",
    "You seem diabetic.",
    "You appear to be diabetic.",
    "This is diabetes.",
    "It looks like cancer.",
    "Sounds like celiac disease.",
    "These symptoms indicate celiac disease.",
    "Your results suggest cancer.",
    "Your condition is diabetes.",
    "Their diagnosis is lupus.",
    "Her illness might be kidney disease.",
    "The diagnosis is Parkinson's disease.",
    "You have a balanced meal plan because you may have lupus.",
    "You have a healthy routine and you might be diabetic.",
    "You have a healthy meal plan and also have cancer.",
    "You have a practical strategy but also have kidney disease.",
    "You suffer from diabetes.",
    "They suffer from lupus.",
    "You exhibit signs of cancer.",
    "She shows symptoms of kidney disease.",
  ]) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }
  for (const message of [
    "You have a healthy meal plan.",
    "You have a practical strategy.",
    "Consider discussing these results with a qualified health professional.",
  ]) assert.doesNotThrow(() => assertNoMedicalOverreach(message), message);
});

test("explicit dietary exclusions are hard blocks and malformed exclusions fail closed", () => {
  const candidate = [{ foodId: "beef-1", foodName: "Dana eti", dietarySafetyDataStatus: "verified" as const, dietaryConflictRuleIds: ["vegetarian"] }];
  assert.throws(() => assertNoDietaryExclusionConflict(candidate, [{ kind: "food", id: "beef-1", label: "Dana eti", resolutionStatus: "resolved" }]), /Dietary safety conflict/);
  assert.throws(() => assertNoDietaryExclusionConflict(candidate, [{ kind: "rule", id: "vegetarian", label: "Vejetaryen", resolutionStatus: "resolved" }]), /Dietary safety conflict/);
  for (const exclusion of [
    { kind: "food" as const, id: null, label: "Kullanıcının kaçındığı besin", resolutionStatus: "unresolved" as const },
    { kind: "food" as const, id: "   ", label: "Bozuk dışlama", resolutionStatus: "resolved" as const },
  ]) assert.throws(() => assertNoDietaryExclusionConflict(candidate, [exclusion]), /unresolved/);
});

test("dietary-rule candidates require verified safety data and canonical identifiers", () => {
  const exclusion = [{ kind: "rule" as const, id: "vegetarian", label: "Vejetaryen", resolutionStatus: "resolved" as const }];
  for (const dietarySafetyDataStatus of ["unknown", "not-applicable"] as const) {
    assert.throws(() => assertNoDietaryExclusionConflict([{ foodId: "mystery", foodName: "Belirsiz ürün", dietarySafetyDataStatus, dietaryConflictRuleIds: [] }], exclusion), /unresolved/);
  }
  assert.throws(() => assertNoDietaryExclusionConflict([{ foodId: "mystery", foodName: "Belirsiz ürün", dietarySafetyDataStatus: "verified", dietaryConflictRuleIds: ["   "] }], exclusion), /dietary rule identifier unresolved/);
});