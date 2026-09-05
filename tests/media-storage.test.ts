import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { getMediaStorage, LocalFileMediaStorage, R2MediaStorage, type R2LikeBucket } from "../lib/media/storage";

const MEDIA_DIR = path.join(process.cwd(), ".data", "media");

test.after(() => { rmSync(MEDIA_DIR, { recursive: true, force: true }); });

test("LocalFileMediaStorage round-trips bytes and content type through put/get, and get returns null for a missing key", async () => {
  const storage = new LocalFileMediaStorage();
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  await storage.put("u1/meal-photo/round-trip", bytes, "image/jpeg");
  const stored = await storage.get("u1/meal-photo/round-trip");
  assert.deepEqual(Array.from(stored?.bytes ?? []), Array.from(bytes));
  assert.equal(stored?.contentType, "image/jpeg");
  assert.equal(await storage.get("u1/meal-photo/does-not-exist"), null);
});

test("LocalFileMediaStorage delete removes both the bytes and the sidecar so a later get returns null", async () => {
  const storage = new LocalFileMediaStorage();
  await storage.put("u1/meal-photo/to-delete", new Uint8Array([9]), "image/png");
  await storage.delete("u1/meal-photo/to-delete");
  assert.equal(await storage.get("u1/meal-photo/to-delete"), null);
  // Deleting an already-missing key must not throw.
  await storage.delete("u1/meal-photo/to-delete");
});

test("LocalFileMediaStorage rejects an absolute-path key, and sanitizes '..' segments out of a relative one rather than letting them escape the media directory", async () => {
  const storage = new LocalFileMediaStorage();
  await assert.rejects(() => storage.put("/etc/passwd", new Uint8Array([1]), "image/png"), /Invalid media storage key/);
  // "." isn't in the allowed key character set, so every "." (including the ".." in a traversal
  // attempt) is replaced before the path is ever built — there is no ".." segment left to escape with.
  await storage.put("u1/../../escape", new Uint8Array([42]), "image/png");
  const stored = await storage.get("u1/../../escape");
  assert.deepEqual(Array.from(stored?.bytes ?? []), [42]);
});

test("getMediaStorage returns the same local instance across calls when no r2 bucket is supplied", () => {
  assert.equal(getMediaStorage(), getMediaStorage());
});

test("getMediaStorage returns an R2MediaStorage wrapping the supplied bucket when one is passed", () => {
  const bucket: R2LikeBucket = {
    put: async () => undefined,
    get: async () => null,
    delete: async () => undefined,
  };
  const storage = getMediaStorage({ r2: bucket });
  assert.ok(storage instanceof R2MediaStorage);
});

test("R2MediaStorage adapts get/put/delete onto the underlying bucket, defaulting content type when the bucket omits it", async () => {
  const calls: { put?: unknown[]; get?: unknown[]; delete?: unknown[] } = {};
  const bucket: R2LikeBucket = {
    put: async (key, value, options) => { calls.put = [key, value, options]; },
    get: async (key) => {
      calls.get = [key];
      return { arrayBuffer: async () => new Uint8Array([7, 8]).buffer, httpMetadata: undefined };
    },
    delete: async (key) => { calls.delete = [key]; },
  };
  const storage = new R2MediaStorage(bucket);
  await storage.put("k1", new Uint8Array([1, 2]), "image/webp");
  assert.deepEqual(calls.put, ["k1", new Uint8Array([1, 2]), { httpMetadata: { contentType: "image/webp" } }]);
  const result = await storage.get("k1");
  assert.equal(result?.contentType, "application/octet-stream");
  assert.deepEqual(Array.from(result?.bytes ?? []), [7, 8]);
  await storage.delete("k1");
  assert.deepEqual(calls.delete, ["k1"]);
});
