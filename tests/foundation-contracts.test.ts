import assert from "node:assert/strict";
import test from "node:test";
import { EXTERNAL_DATA_FLOWS, getFlowsForTrigger, validateExternalDataFlows } from "../lib/privacy/data-flows";
import { ARVEN_EXPORT_FORMAT, validateExportManifest } from "../lib/portability/types";

const validManifest = {
  format: ARVEN_EXPORT_FORMAT,
  exportedAt: "2026-09-02T10:00:00.000Z",
  locale: "tr-TR",
  timezone: "Europe/Istanbul",
  sections: ["profile", "goals", "meal-log"] as const,
  recordCounts: { profile: 1, goals: 2, "meal-log": 14 },
};

test("external data-flow registry is structurally valid", () => {
  assert.doesNotThrow(() => validateExternalDataFlows(EXTERNAL_DATA_FLOWS));
  const barcodeFlows = getFlowsForTrigger("barcode-lookup");
  assert.equal(barcodeFlows.length, 1);
  assert.deepEqual(barcodeFlows[0]?.categories, ["barcode"]);
});

test("duplicate external data-flow ids are rejected", () => {
  const sample = EXTERNAL_DATA_FLOWS[0];
  assert.ok(sample);
  assert.throws(() => validateExternalDataFlows([sample, sample]), /Duplicate data-flow id/);
});

test("versioned export manifest accepts a valid portable bundle description", () => {
  assert.doesNotThrow(() => validateExportManifest(validManifest));
});

test("export manifest requires a real canonical UTC generation timestamp", () => {
  for (const exportedAt of [
    "0",
    "2026-02-31",
    "2026-02-31T10:00:00.000Z",
    "2026-09-02 10:00:00Z",
    "2026-09-02T24:01:00Z",
    "2026-09-02T10:00:00+03:00",
  ]) {
    assert.throws(
      () => validateExportManifest({ ...validManifest, exportedAt }),
      /canonical UTC timestamp/,
      exportedAt,
    );
  }
});

test("invalid export record counts are rejected", () => {
  assert.throws(() => validateExportManifest({
    format: ARVEN_EXPORT_FORMAT,
    exportedAt: "2026-09-02T10:00:00.000Z",
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    sections: ["meal-log"],
    recordCounts: { "meal-log": -1 },
  }), /Invalid record count/);
});

test("unknown export section identifiers are rejected at runtime", () => {
  assert.throws(() => validateExportManifest({
    format: ARVEN_EXPORT_FORMAT,
    exportedAt: "2026-09-02T10:00:00.000Z",
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    sections: ["profile", "future-or-typo"],
    recordCounts: { profile: 1 },
  }), /Unsupported export section/);
});

test("record counts cannot reference undeclared or unknown sections", () => {
  assert.throws(() => validateExportManifest({
    format: ARVEN_EXPORT_FORMAT,
    exportedAt: "2026-09-02T10:00:00.000Z",
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    sections: ["profile"],
    recordCounts: { goals: 1 },
  }), /undeclared section/);
});
