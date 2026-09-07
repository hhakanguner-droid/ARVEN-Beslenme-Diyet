import type { RouteContext } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";
import type { PhotoAssetKind, StoredPhotoAsset } from "@/lib/persistence/v1-boundary";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8_000_000;

export type ParsedPhotoUpload = { asset: StoredPhotoAsset; bytes: Uint8Array };

/**
 * Shared intake for all three `/api/vision/*` routes: reads the uploaded `photo` file from a
 * `multipart/form-data` body, validates its type/size against the same rules as
 * `db/migrations/0005_phase5_vision.sql`'s CHECK constraints, stores the bytes via
 * `lib/media/storage.ts`, and records the metadata row. Bytes never touch D1/the Durable Object —
 * only the small `photo_assets` row does.
 *
 * Faz 9 hardening: if metadata persistence fails after the object was written — including the
 * account-deletion-in-progress rejection `V1MutationService.recordPhotoAsset` now applies (see
 * `V1Transaction.beginAccountDeletion`'s doc comment) — the object is removed immediately so a
 * sensitive orphan cannot remain in storage without a database pointer, same as
 * `lib/api/lab-upload.ts`'s `parseLabPhotoUpload`.
 */
export async function parsePhotoUpload(request: Request, context: RouteContext, kind: PhotoAssetKind): Promise<ParsedPhotoUpload> {
  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    throw new Error("photo file is required");
  }
  const mimeType = file.type;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("photo must be image/jpeg, image/png, or image/webp");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_BYTES) {
    throw new Error("photo must be between 1 byte and 8,000,000 bytes");
  }
  const storageKey = `${context.subject}/${kind}/${crypto.randomUUID()}`;
  const storage = getMediaStorage();
  await storage.put(storageKey, bytes, mimeType);
  try {
    const asset = await context.service.recordPhotoAsset({
      kind,
      mimeType: mimeType as StoredPhotoAsset["mimeType"],
      byteSize: bytes.length,
      storageKey,
    });
    return { asset, bytes };
  } catch (error) {
    try {
      await storage.delete(storageKey);
    } catch {
      // Preserve the original persistence error; storage cleanup can be retried by operational
      // tooling using the deterministic subject/kind prefix.
    }
    throw error;
  }
}

/** Base64-encodes photo bytes for the OpenAI vision `image_url` data: URL — small helper kept here so every vision route encodes the same way. */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
