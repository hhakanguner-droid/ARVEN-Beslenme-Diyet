import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("active local runtime applies Phase 6 health hardening schema", () => {
  const localRuntime = source("lib/persistence/local-runtime.ts");
  assert.match(localRuntime, /USER_DURABLE_OBJECT_PHASE6_HARDENING/);
  assert.match(localRuntime, /db\.exec\(USER_DURABLE_OBJECT_PHASE6_HARDENING\)/);
});

test("lab extraction safety is enforced at the mutation boundary", () => {
  const boundary = source("lib/persistence/v1-boundary.ts");
  const start = boundary.indexOf("async recordLabResultEntries");
  const end = boundary.indexOf("async recordManualLabResultEntry", start);
  assert.ok(start >= 0 && end > start);
  const method = boundary.slice(start, end);
  assert.match(method, /assertNoMedicalOverreach/);
  assert.match(method, /x\.markerName/);
  assert.match(method, /x\.valueText/);
  assert.match(method, /x\.unitText/);
  assert.match(method, /x\.referenceRangeText/);
});

test("supplement allowlist is enforced at the mutation boundary", () => {
  const boundary = source("lib/persistence/v1-boundary.ts");
  const start = boundary.indexOf("async recordSupplement");
  const end = boundary.indexOf("async listSupplements", start);
  assert.ok(start >= 0 && end > start);
  const method = boundary.slice(start, end);
  assert.match(method, /isKnownSupplementName\(x\.name\)/);
  assert.match(method, /unverified-supplement-name/);
});

test("repeated identical lab confirmation is idempotent while changed rewrites are rejected", () => {
  const adapter = source("lib/persistence/durable-object-adapter.ts");
  const start = adapter.indexOf("async confirmLabResultEntry");
  const end = adapter.indexOf("async deleteLabResultEntry", start);
  assert.ok(start >= 0 && end > start);
  const method = adapter.slice(start, end);
  assert.match(method, /existing\.status === "confirmed"/);
  assert.match(method, /if \(identical\) return existing/);
  assert.match(method, /immutable; create a new correction instead/);
});

test("lab AI validation failures use the provider invalid-reply fallback", () => {
  const route = source("app/api/vision/lab-photo/route.ts");
  assert.match(route, /parseSafeLabExtraction\(rawExtraction\)/);
  assert.match(route, /new AiProviderError\("invalid-reply"/);
});
