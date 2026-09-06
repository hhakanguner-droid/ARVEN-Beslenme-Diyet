import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRunner } from "./fixtures/memory-transaction";
import { mealLogToCsv, measurementsToCsv, waterLogToCsv } from "@/lib/portability/csv";
import { buildUserExport } from "@/lib/portability/export";
import { importUserExport } from "@/lib/portability/import";
import { V1MutationService, type StoredBodyMeasurement, type StoredNutritionEvent } from "@/lib/persistence/v1-boundary";

const CLOCK = { now: () => new Date("2026-09-06T12:00:00.000Z") };

async function seedUser(subject: string) {
  const runner = new MemoryRunner();
  const service = new V1MutationService(subject, runner, undefined, CLOCK);
  await service.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  await service.upsertProfile({ schemaVersion: "ProfileUpsertV1", displayName: "Ada", birthDate: "1990-01-01", sexAtBirth: "female", heightCm: 165, activityLevel: "moderate" });
  await runner.tx.insertNutritionEvent({ id: "evt-meal-1", userSubject: subject, eventType: "meal-log", occurredAt: "2026-09-01T08:00:00.000Z", localDate: "2026-09-01", payloadJson: JSON.stringify({ schemaVersion: "MealEventV1", mealType: "breakfast", items: [{ foodName: "Yoğurt, Muz", grams: 200, nutrition: { energyKcal: 150, proteinG: 8, carbsG: 20, fatG: 4, fiberG: 2 } }] }), createdAt: "2026-09-01T08:00:00.000Z" });
  await runner.tx.insertNutritionEvent({ id: "evt-water-1", userSubject: subject, eventType: "water-log", occurredAt: "2026-09-01T09:00:00.000Z", localDate: "2026-09-01", payloadJson: JSON.stringify({ schemaVersion: "WaterEventV1", milliliters: 250 }), createdAt: "2026-09-01T09:00:00.000Z" });
  await service.recordBodyMeasurement({ schemaVersion: "BodyMeasurementCreateV1", localDate: "2026-09-01", weightKg: 70.2, bodyFatPercent: null, waistCm: null, hipCm: null, chestCm: null, note: "sabah, aç karnına" });
  await service.recordMemoryFacts({ schemaVersion: "MemoryFactRecordV1", facts: [{ factText: "kahvaltıda genelde yumurta tercih ediyor", confidence: "high", provenance: "user-stated" }] });
  return { runner, service };
}

test("buildUserExport gathers every declared section, scoped only to the requesting subject", async () => {
  const { runner, service } = await seedUser("user-a");
  // A second user's data must never leak into the first user's export.
  await seedUser("user-b");
  const userContext = await service.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });

  const payload = await buildUserExport(runner, "user-a", userContext, "tr-TR", CLOCK.now());

  assert.equal(payload.manifest.format, "ArvenNutritionExportV1");
  assert.deepEqual(payload.manifest.sections, ["profile", "goals", "preferences", "meal-log", "water-log", "measurements", "recipes", "custom-foods", "ai-memory", "media-manifest"]);
  assert.equal(payload.profile?.displayName, "Ada");
  assert.equal(payload.mealLog.length, 1);
  assert.equal(payload.waterLog.length, 1);
  assert.equal(payload.measurements.length, 1);
  assert.equal(payload.aiMemory.length, 1);
  assert.ok(payload.mealLog.every((e) => e.userSubject === "user-a"), "export must never include another subject's events");
  assert.equal(payload.manifest.recordCounts["meal-log"], 1);
  assert.equal(payload.manifest.recordCounts["water-log"], 1);
});

test("mealLogToCsv/waterLogToCsv/measurementsToCsv escape commas, quotes and newlines per RFC 4180", () => {
  const events: StoredNutritionEvent[] = [{
    id: "e1", userSubject: "u1", eventType: "meal-log", occurredAt: "2026-09-01T08:00:00.000Z", localDate: "2026-09-01",
    payloadJson: JSON.stringify({ schemaVersion: "MealEventV1", mealType: "breakfast", items: [{ foodName: 'Çorba, "ev yapımı"\nsıcak', grams: 250, nutrition: { energyKcal: 90 } }] }),
    createdAt: "2026-09-01T08:00:00.000Z",
  }];
  const csv = mealLogToCsv(events);
  assert.match(csv, /"Çorba, ""ev yapımı""\nsıcak"/);
  assert.match(csv, /^occurredAt,localDate,mealType,foodName,grams,energyKcal,proteinG,carbsG,fatG,fiberG\r\n/);

  const waterCsv = waterLogToCsv([{ id: "e2", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-01T09:00:00.000Z", localDate: "2026-09-01", payloadJson: JSON.stringify({ schemaVersion: "WaterEventV1", milliliters: 300 }), createdAt: "2026-09-01T09:00:00.000Z" }]);
  assert.match(waterCsv, /2026-09-01T09:00:00\.000Z,2026-09-01,300/);

  const measurements: StoredBodyMeasurement[] = [{ id: "m1", userSubject: "u1", localDate: "2026-09-01", weightKg: 70.2, bodyFatPercent: null, waistCm: null, hipCm: null, chestCm: null, note: "not, virgüllü", createdAt: "2026-09-01T08:00:00.000Z" }];
  assert.match(measurementsToCsv(measurements), /"not, virgüllü"/);
});

test("importUserExport rejects a file whose manifest is missing or has an unsupported format", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(() => importUserExport(runner, "user-a", { profile: {} }));
  await assert.rejects(() => importUserExport(runner, "user-a", { manifest: { format: "SomeOtherAppExportV9" } }));
});

test("importUserExport restores an exported backup into a different (fresh) account, regenerating every id and always using the authenticated subject", async () => {
  const source = await seedUser("original-user");
  const userContext = await source.service.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  const exportPayload = await buildUserExport(source.runner, "original-user", userContext, "tr-TR", CLOCK.now());

  const targetRunner = new MemoryRunner();
  const targetService = new V1MutationService("restored-user", targetRunner, undefined, CLOCK);
  const summary = await importUserExport(targetRunner, "restored-user", exportPayload);

  assert.equal(summary.imported.profile, 1);
  assert.equal(summary.imported["meal-log"], 1);
  assert.equal(summary.imported["water-log"], 1);
  assert.equal(summary.imported.measurements, 1);
  assert.equal(summary.imported["ai-memory"], 1);
  assert.equal(summary.skipped["media-manifest"], 0);

  const restoredProfile = await targetRunner.transaction((tx) => tx.getProfile("restored-user"));
  assert.equal(restoredProfile?.displayName, "Ada");
  assert.equal(restoredProfile?.userSubject, "restored-user", "a restored row must always belong to the authenticated importer, never the file's original owner");

  const restoredEvents = await targetService.listAllNutritionEvents();
  assert.equal(restoredEvents.length, 2);
  assert.ok(restoredEvents.every((e) => e.userSubject === "restored-user"));
  assert.ok(restoredEvents.every((e) => e.id !== "evt-meal-1" && e.id !== "evt-water-1"), "imported rows must get freshly generated ids, never the ids from the uploaded file");

  const restoredMeasurements = await targetService.listBodyMeasurements();
  assert.equal(restoredMeasurements.length, 1);
  assert.equal(restoredMeasurements[0]?.weightKg, 70.2);

  // Importing the very same backup a second time must not collide with the first import (new ids again).
  const secondSummary = await importUserExport(targetRunner, "restored-user", exportPayload);
  assert.equal(secondSummary.imported["meal-log"], 1);
  assert.equal((await targetService.listAllNutritionEvents()).length, 4, "a repeat import duplicates history rather than colliding or overwriting");
});

test("importUserExport never restores media bytes/rows from a media-manifest section — it only reports how many were skipped", async () => {
  const runner = new MemoryRunner();
  const manifest = { format: "ArvenNutritionExportV1", exportedAt: "2026-09-06T12:00:00.000Z", locale: "tr-TR", timezone: "Europe/Istanbul", sections: ["media-manifest"], recordCounts: { "media-manifest": 2 } };
  const summary = await importUserExport(runner, "user-a", { manifest, mediaManifest: [{ id: "p1" }, { id: "p2" }] });
  assert.equal(summary.skipped["media-manifest"], 2);
  assert.equal(summary.imported["media-manifest"], undefined);
});
