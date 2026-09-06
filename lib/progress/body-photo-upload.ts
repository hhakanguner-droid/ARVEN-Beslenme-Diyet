import type { RouteContext } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";
import type { BodyPhotoAngle, StoredBodyPhotoSet } from "@/lib/persistence/v1-boundary";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_ANGLES = new Set(["front", "side", "back"]);
const MAX_BYTES = 8_000_000;

/**
 * Shared intake for `/api/body-photos`, mirroring `lib/api/vision-upload.ts`'s `parsePhotoUpload`
 * exactly, but against `body_photo_sets` (Faz 8) instead of `photo_assets` (Faz 5) — see
 * `db/migrations/0009_phase8_progress.sql` for why this is a separate table rather than a new
 * `photo_assets.kind`. Reads `photo` (the file), `localDate`, and an optional `angle` from a
 * `multipart/form-data` body.
 */
export async function parseBodyPhotoUpload(request: Request, context: RouteContext): Promise<StoredBodyPhotoSet> {
  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) throw new Error("photo file is required");
  const mimeType = file.type;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("photo must be image/jpeg, image/png, or image/webp");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_BYTES) throw new Error("photo must be between 1 byte and 8,000,000 bytes");
  const localDate = form.get("localDate");
  if (typeof localDate !== "string" || !localDate) throw new Error("localDate is required");
  const angleRaw = form.get("angle");
  const angle = angleRaw == null || angleRaw === "" ? null : String(angleRaw);
  if (angle !== null && !ALLOWED_ANGLES.has(angle)) throw new Error("angle must be front, side, or back");
  const storageKey = `${context.subject}/body-progress-photo/${crypto.randomUUID()}`;
  await getMediaStorage().put(storageKey, bytes, mimeType);
  return context.service.recordBodyPhotoSet({
    localDate,
    angle: angle as BodyPhotoAngle | null,
    mimeType: mimeType as StoredBodyPhotoSet["mimeType"],
    byteSize: bytes.length,
    storageKey,
  });
}
