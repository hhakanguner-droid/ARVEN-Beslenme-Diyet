import assert from "node:assert/strict";
import test from "node:test";
import { EXTERNAL_DATA_FLOWS, getFlowsForTrigger, validateExternalDataFlows } from "../lib/privacy/data-flows";
import { ARVEN_EXPORT_FORMAT, validateExportManifest } from "../lib/portability/types";

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
  assert.doesNotThrow(() => validateExportManifest({
    format: ARVEN_EXPORT_FORMAT,
    exportedAt: "2026-09-02T10:00:00.000Z",
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    sections: ["profile", "goals", "meal-log"],
    recordCounts: { profile: 1, goals: 2, "meal-log": 14 },
  }));
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
