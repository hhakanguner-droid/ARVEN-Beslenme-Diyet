import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSafeLabExtraction } from "../lib/health-safety/lab-extraction";
import { getFlowsForTrigger } from "../lib/privacy/data-flows";
import { isKnownSupplementName } from "../lib/supplements/reference";

test("lab extraction external flow is declared as explicit opt-in", () => {
  const flows = getFlowsForTrigger("lab-extraction");
  assert.equal(flows.length, 1);
  assert.equal(flows[0]?.destinationLabel, "OpenAI");
  assert.equal(flows[0]?.consentMode, "explicit-opt-in");
  assert.ok(flows[0]?.categories.includes("lab-file"));
});

test("AI-authored lab value/unit/range fields cannot contain medical directives", () => {
  const base = { markerName: "Glukoz", valueText: "92", unitText: "mg/dL", referenceRangeText: "70-100" };
  assert.doesNotThrow(() => parseSafeLabExtraction({ entries: [base], uncertainty: [] }));
  for (const field of ["valueText", "unitText", "referenceRangeText"] as const) {
    assert.throws(() => parseSafeLabExtraction({ entries: [{ ...base, [field]: "İlacını bırak" }], uncertainty: [] }));
  }
});

test("free-text medication names are not accepted as curated supplements", () => {
  assert.equal(isKnownSupplementName("D vitamini"), true);
  assert.equal(isKnownSupplementName("Magnezyum"), true);
  assert.equal(isKnownSupplementName("Metformin"), false);
});

test("lab confirmation migration preserves extracted and confirmed values immutably", () => {
  const migration = readFileSync(new URL("../db/migrations/0007_phase6_health_hardening.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE lab_result_confirmations/);
  assert.match(migration, /OLD\.marker_name/);
  assert.match(migration, /NEW\.marker_name/);
  assert.match(migration, /lab_result_prevent_confirmed_rewrite/);
});

test("lab upload and delete paths retain a recoverable storage lifecycle", () => {
  const upload = readFileSync(new URL("../lib/api/lab-upload.ts", import.meta.url), "utf8");
  const deletion = readFileSync(new URL("../app/api/lab/documents/[id]/route.ts", import.meta.url), "utf8");
  assert.match(upload, /await storage\.delete\(storageKey\)/);
  assert.ok(deletion.indexOf("getMediaStorage().delete(document.storageKey)") < deletion.indexOf("context.service.deleteLabDocument(id)"));
});
