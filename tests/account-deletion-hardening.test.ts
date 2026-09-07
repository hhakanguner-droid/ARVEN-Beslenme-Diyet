import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { RouteContext } from "@/lib/api/route-context";
import { parseLabPhotoUpload } from "@/lib/api/lab-upload";
import { parsePhotoUpload } from "@/lib/api/vision-upload";
import { getMediaStorage } from "@/lib/media/storage";
import { V1MutationService } from "@/lib/persistence/v1-boundary";
import { parseBodyPhotoUpload } from "@/lib/progress/body-photo-upload";
import { MemoryRunner } from "./fixtures/memory-transaction";

/**
 * Faz 9 hardening regression suite for Risk 1 (account-delete race / orphan media — see the task's
 * `account_deletion_state` tombstone). These tests exercise the *real* production code paths
 * (`parsePhotoUpload`, `parseLabPhotoUpload`, `parseBodyPhotoUpload`, `V1MutationService`) against an
 * in-memory `V1Transaction` (`MemoryRunner`) plus the real, working `LocalFileMediaStorage` — so a
 * regression in the guard, in the compensating-delete try/catch, or in the tombstone lifecycle itself
 * shows up here exactly as it would in production.
 */

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function makeContext(runner: MemoryRunner, subject: string, service?: V1MutationService): RouteContext {
  return {
    subject,
    runner,
    service: service ?? new V1MutationService(subject, runner),
    userContext: { timezone: "Europe/Istanbul", nutritionDayStartMinutes: 0 },
    todayLocalDate: "2026-09-07",
  };
}

/** Counts the `.bin` objects `LocalFileMediaStorage` has actually persisted under a subject/kind prefix — the ground truth for "is there an orphan object". */
function mediaObjectCount(subject: string, kindDir: string): number {
  const dir = path.join(process.cwd(), ".data", "media", subject, kindDir);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith(".bin")).length;
}

/** `.data/media/<subject>` is real, on-disk, and NOT reset between test runs (same convention as the other local SQLite/media fixtures in this repo) — each test using a subject here wipes that subject's own directory first so repeated runs never see a previous run's leftover objects as false orphans. */
function resetSubjectMedia(subject: string): void {
  rmSync(path.join(process.cwd(), ".data", "media", subject), { recursive: true, force: true });
}

function photoRequest(): Request {
  const form = new FormData();
  form.set("photo", new File([new Uint8Array([1, 2, 3, 4])], "photo.jpg", { type: "image/jpeg" }));
  return new Request("http://local.test/upload", { method: "POST", body: form });
}

function bodyPhotoRequest(): Request {
  const form = new FormData();
  form.set("photo", new File([new Uint8Array([5, 6, 7, 8])], "photo.jpg", { type: "image/jpeg" }));
  form.set("localDate", "2026-09-07");
  form.set("angle", "front");
  return new Request("http://local.test/upload", { method: "POST", body: form });
}

test("beginAccountDeletion is idempotent and getAccountDeletionState reflects the tombstone", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("acct-del-idempotent", r, undefined, { now: () => new Date("2026-09-07T10:00:00Z") });
  assert.equal(await s.getAccountDeletionState(), null);
  const first = await s.beginAccountDeletion();
  const second = await s.beginAccountDeletion();
  assert.equal(second.startedAt, first.startedAt, "a retried beginAccountDeletion must reuse the original tombstone, not reset it");
  assert.deepEqual(await s.getAccountDeletionState(), first);
});

test("body-progress photo upload is rejected once account deletion has begun, and leaves no orphan bytes in storage", async () => {
  const subject = "acct-del-body-photo";
  resetSubjectMedia(subject);
  const r = new MemoryRunner();
  const context = makeContext(r, subject);
  await context.service.beginAccountDeletion();
  await assert.rejects(() => parseBodyPhotoUpload(bodyPhotoRequest(), context), /Account deletion is in progress/);
  assert.equal(r.tx.bodyPhotoSets.size, 0, "no metadata row may be recorded once deletion has started");
  assert.equal(mediaObjectCount(subject, "body-progress-photo"), 0, "the object written before the rejected metadata insert must not survive as an orphan");
});

test("lab photo upload is rejected once account deletion has begun, and leaves no orphan bytes in storage", async () => {
  const subject = "acct-del-lab-photo";
  resetSubjectMedia(subject);
  const r = new MemoryRunner();
  const context = makeContext(r, subject);
  await context.service.beginAccountDeletion();
  await assert.rejects(() => parseLabPhotoUpload(photoRequest(), context), /Account deletion is in progress/);
  assert.equal(r.tx.labDocuments.size, 0);
  assert.equal(mediaObjectCount(subject, "lab-document"), 0);
});

test("meal/menu/product photo upload is rejected once account deletion has begun, and leaves no orphan bytes in storage", async () => {
  const subject = "acct-del-meal-photo";
  resetSubjectMedia(subject);
  const r = new MemoryRunner();
  const context = makeContext(r, subject);
  await context.service.beginAccountDeletion();
  await assert.rejects(() => parsePhotoUpload(photoRequest(), context, "meal-photo"), /Account deletion is in progress/);
  assert.equal(r.tx.photoAssets.size, 0);
  assert.equal(mediaObjectCount(subject, "meal-photo"), 0);
});

test("progress report metadata write is rejected once account deletion has begun", async () => {
  const r = new MemoryRunner();
  const s = new V1MutationService("acct-del-report", r);
  await s.beginAccountDeletion();
  await assert.rejects(
    () => s.recordProgressReportExport({ reportType: "daily", periodLocalDate: "2026-09-07", byteSize: 10, storageKey: "acct-del-report/progress-report/x.pdf" }),
    /Account deletion is in progress/,
  );
  assert.equal(r.tx.progressReportExports.size, 0);
});

test("uploads succeed normally before any deletion has begun (no false-positive rejection)", async () => {
  const subject = "acct-del-control";
  resetSubjectMedia(subject);
  const r = new MemoryRunner();
  const context = makeContext(r, subject);
  const { asset } = await parsePhotoUpload(photoRequest(), context, "meal-photo");
  assert.equal(r.tx.photoAssets.size, 1);
  assert.equal(mediaObjectCount(subject, "meal-photo"), 1);
  assert.equal(asset.userSubject, subject);
});

test("a metadata-persist failure unrelated to deletion still triggers the compensating delete (no orphan, original error preserved)", async () => {
  const subject = "acct-del-unrelated-failure";
  resetSubjectMedia(subject);
  class FailingService extends V1MutationService {
    async recordLabDocument(): Promise<never> {
      throw new Error("simulated-metadata-persist-failure");
    }
  }
  const r = new MemoryRunner();
  const context = makeContext(r, subject, new FailingService(subject, r));
  await assert.rejects(() => parseLabPhotoUpload(photoRequest(), context), /simulated-metadata-persist-failure/);
  assert.equal(mediaObjectCount(subject, "lab-document"), 0, "the compensating delete must remove the object even when the failure is unrelated to account deletion");
});

test("account deletion end-to-end: storage objects and metadata rows across every media kind are both empty afterward, and the tombstone itself is cleared", async () => {
  const subject = "acct-del-full-flow";
  resetSubjectMedia(subject);
  const r = new MemoryRunner();
  const context = makeContext(r, subject);

  // Seed one object of every media kind the account-delete route must cover.
  await parsePhotoUpload(photoRequest(), context, "meal-photo");
  await parseLabPhotoUpload(photoRequest(), context);
  await parseBodyPhotoUpload(bodyPhotoRequest(), context);
  await context.service.recordProgressReportExport({ reportType: "daily", periodLocalDate: "2026-09-07", byteSize: 10, storageKey: `${subject}/progress-report/seed.pdf` });
  await getMediaStorage().put(`${subject}/progress-report/seed.pdf`, new Uint8Array([1]), "application/pdf");

  assert.equal(mediaObjectCount(subject, "meal-photo"), 1);
  assert.equal(mediaObjectCount(subject, "lab-document"), 1);
  assert.equal(mediaObjectCount(subject, "body-progress-photo"), 1);
  assert.equal(mediaObjectCount(subject, "progress-report"), 1);

  // Same algorithm as `app/api/account/route.ts`'s DELETE handler: tombstone first, then list, then
  // storage-first/metadata-second deletion, then the transactional metadata purge.
  await context.service.beginAccountDeletion();
  const storage = getMediaStorage();
  const [photos, labDocuments, bodyPhotos, reports] = await Promise.all([
    context.service.listPhotoAssets(),
    context.service.listLabDocuments(),
    context.service.listBodyPhotoSets(),
    context.service.listProgressReportExports(),
  ]);
  for (const asset of [...photos, ...labDocuments, ...bodyPhotos, ...reports]) await storage.delete(asset.storageKey);
  await context.service.deleteAccount();

  assert.equal(mediaObjectCount(subject, "meal-photo"), 0);
  assert.equal(mediaObjectCount(subject, "lab-document"), 0);
  assert.equal(mediaObjectCount(subject, "body-progress-photo"), 0);
  assert.equal(mediaObjectCount(subject, "progress-report"), 0);
  assert.equal(r.tx.photoAssets.size, 0);
  assert.equal(r.tx.labDocuments.size, 0);
  assert.equal(r.tx.bodyPhotoSets.size, 0);
  assert.equal(r.tx.progressReportExports.size, 0);
  assert.equal(await context.service.getAccountDeletionState(), null, "purgeAuthenticatedUser must clear the tombstone alongside every other owned row");
});

test("account deletion route tombstones before listing media, and only purges the account once every storage delete has succeeded (so a partial failure stays retryable)", () => {
  const route = source("app/api/account/route.ts");
  const beginIndex = route.indexOf("beginAccountDeletion()");
  const listIndex = route.indexOf("listPhotoAssets()");
  const failuresPushIndex = route.indexOf("failures.push(");
  const consoleErrorIndex = route.indexOf("console.error(");
  const throwOnFailureIndex = route.indexOf("if (failures.length > 0)");
  const deleteAccountIndex = route.indexOf("context.service.deleteAccount()");
  assert.ok(beginIndex >= 0 && listIndex >= 0 && beginIndex < listIndex, "the tombstone must be set before this subject's media is even listed, closing the concurrent-upload race window");
  assert.ok(failuresPushIndex >= 0 && consoleErrorIndex >= 0 && failuresPushIndex < consoleErrorIndex, "a storage-delete failure must be recorded and logged with enough context (subject/storageKey) to retry it");
  assert.ok(throwOnFailureIndex >= 0 && throwOnFailureIndex < deleteAccountIndex, "the account row (and its tombstone) must only be purged after confirming there were no storage-delete failures");
  assert.match(route, /subject: context\.subject, storageKey: asset\.storageKey/, "the failure log must carry enough identity to find and retry the exact orphaned object");
});
