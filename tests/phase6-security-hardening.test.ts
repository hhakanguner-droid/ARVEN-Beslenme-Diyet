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

test("lab upload checks external AI consent before persisting the file", () => {
  const route = readFileSync(new URL("../app/api/vision/lab-photo/route.ts", import.meta.url), "utf8");
  const consentCheck = route.indexOf("request.headers.get(LAB_AI_CONSENT_HEADER)");
  const upload = route.indexOf("parseLabPhotoUpload(request, context)");
  assert.ok(consentCheck >= 0 && upload > consentCheck);
});

test("lab extraction sends a minimal transcription prompt, not user AI context", () => {
  const route = readFileSync(new URL("../app/api/vision/lab-photo/route.ts", import.meta.url), "utf8");
  assert.match(route, /LAB_EXTRACTION_SYSTEM_PROMPT/);
  assert.doesNotMatch(route, /buildAiContext|renderSystemPrompt/);
});

test("lab UI explicitly opts in and sends the consent header", () => {
  const page = readFileSync(new URL("../app/(app)/saglik/tahliller/page.tsx", import.meta.url), "utf8");
  assert.match(page, /allowExternalAi/);
  assert.match(page, /x-arven-lab-ai-consent/);
  assert.match(page, /type="checkbox"/);
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
  assert.match(migration, /REFERENCES lab_result_entries\(id\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES users\(subject\) ON DELETE CASCADE/);
});

test("Durable Object runtime applies the Phase 6 audit schema", () => {
  const object = readFileSync(new URL("../lib/persistence/user-durable-object.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../db/migrations/durable-object/0002_phase6_health_hardening.ts", import.meta.url), "utf8");
  assert.match(object, /USER_DURABLE_OBJECT_PHASE6_HARDENING/);
  assert.match(object, /storage\.sql\.exec\(USER_DURABLE_OBJECT_PHASE6_HARDENING\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS lab_result_confirmations/);
  assert.match(schema, /ON DELETE CASCADE/);
  assert.match(schema, /lab_result_prevent_confirmed_rewrite/);
});

test("lab upload and delete paths retain a recoverable storage lifecycle", () => {
  const upload = readFileSync(new URL("../lib/api/lab-upload.ts", import.meta.url), "utf8");
  const deletion = readFileSync(new URL("../app/api/lab/documents/[id]/route.ts", import.meta.url), "utf8");
  assert.match(upload, /await storage\.delete\(storageKey\)/);
  assert.ok(deletion.indexOf("getMediaStorage().delete(document.storageKey)") < deletion.indexOf("context.service.deleteLabDocument(id)"));
});
