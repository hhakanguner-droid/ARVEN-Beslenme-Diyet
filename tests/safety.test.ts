import assert from "node:assert/strict";
import test from "node:test";
import { assertNoAllergyConflict, assertNoMedicalOverreach } from "../lib/health-safety/policy";

test("allergy conflicts are hard blocked", () => {
  assert.throws(() => assertNoAllergyConflict(["Fıstık ezmeli yoğurt"], ["fıstık"]), /Allergy conflict/);
  assert.doesNotThrow(() => assertNoAllergyConflict(["Izgara kabak"], ["fıstık"]));
});

test("diagnostic or medication-changing language is rejected", () => {
  assert.throws(() => assertNoMedicalOverreach("Bu durumda ilacı bırak."), /non-diagnostic/);
  assert.doesNotThrow(() => assertNoMedicalOverreach("Bu sonuçları doktorunla değerlendirmen uygun olur."));
});
