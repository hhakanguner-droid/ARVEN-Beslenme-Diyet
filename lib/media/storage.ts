import { existsSync, mkdirSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private binary object storage for user photos (meal photos, menu photos, product photos —
 * Phase 5). Deliberately separate from `V1Transaction`/D1/the Durable Object: image bytes never
 * belong in a SQLite row. `photo_assets` (see `db/migrations/0005_phase5_vision.sql`) stores only
 * the small metadata needed to address an object here.
 */
export type StoredMedia = { bytes: Uint8Array; contentType: string };

export type MediaStorage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredMedia | null>;
  delete(key: string): Promise<void>;
};

/**
 * Local development stand-in, Node-only — mirrors `lib/persistence/local-runtime.ts`'s approach of
 * giving `next dev`/`next start` a real, working implementation with the exact same `MediaStorage`
 * shape production uses, so no business logic (route handlers, `lib/ai/provider.ts` callers) needs
 * to know which one it's talking to. Files live under `.data/media/` (gitignored, same convention
 * as the local SQLite files) as `<sanitized key>.bin` plus a `<sanitized key>.json` sidecar
 * carrying the content type, since a bare file has no header to record it in.
 */
const MEDIA_DIR = path.join(process.cwd(), ".data", "media");

function sanitizeKey(key: string): string {
  const sanitized = key.replace(/[^a-zA-Z0-9_/-]/g, "_");
  if (sanitized.includes("..") || sanitized.startsWith("/") || !sanitized.trim()) {
    throw new Error("Invalid media storage key");
  }
  return sanitized;
}

export class LocalFileMediaStorage implements MediaStorage {
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const safeKey = sanitizeKey(key);
    const binPath = path.join(MEDIA_DIR, `${safeKey}.bin`);
    const metaPath = path.join(MEDIA_DIR, `${safeKey}.json`);
    mkdirSync(path.dirname(binPath), { recursive: true });
    await writeFile(binPath, bytes);
    await writeFile(metaPath, JSON.stringify({ contentType }));
  }

  async get(key: string): Promise<StoredMedia | null> {
    const safeKey = sanitizeKey(key);
    const binPath = path.join(MEDIA_DIR, `${safeKey}.bin`);
    const metaPath = path.join(MEDIA_DIR, `${safeKey}.json`);
    if (!existsSync(binPath) || !existsSync(metaPath)) return null;
    const [bytes, metaRaw] = await Promise.all([readFile(binPath), readFile(metaPath, "utf-8")]);
    const meta = JSON.parse(metaRaw) as { contentType: string };
    return { bytes: new Uint8Array(bytes), contentType: meta.contentType };
  }

  async delete(key: string): Promise<void> {
    const safeKey = sanitizeKey(key);
    const binPath = path.join(MEDIA_DIR, `${safeKey}.bin`);
    const metaPath = path.join(MEDIA_DIR, `${safeKey}.json`);
    await Promise.all([
      rm(binPath, { force: true }),
      rm(metaPath, { force: true }),
    ]);
  }
}

/** The subset of Cloudflare's `R2Bucket` interface this adapter actually calls. */
export type R2LikeBucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

/**
 * Production adapter (see `ARVEN_STORAGE_DRIVER=r2` in `.env.example`). Not reachable yet — real
 * Next.js request handling on the Cloudflare Worker still needs the `@opennextjs/cloudflare`
 * adapter wired in (see `custom-worker.ts`) — but the shape is real so wiring in a live `R2Bucket`
 * binding later touches no business logic in the API routes or `lib/ai/provider.ts` callers above.
 */
export class R2MediaStorage implements MediaStorage {
  constructor(private readonly bucket: R2LikeBucket) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<StoredMedia | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    const bytes = new Uint8Array(await object.arrayBuffer());
    return { bytes, contentType: object.httpMetadata?.contentType ?? "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

let localMediaStorage: LocalFileMediaStorage | null = null;

/** Picks the R2-backed adapter when a bucket binding is passed in (production, once wired), otherwise the local dev stand-in. */
export function getMediaStorage(env?: { r2?: R2LikeBucket }): MediaStorage {
  if (env?.r2) return new R2MediaStorage(env.r2);
  if (!localMediaStorage) localMediaStorage = new LocalFileMediaStorage();
  return localMediaStorage;
}
