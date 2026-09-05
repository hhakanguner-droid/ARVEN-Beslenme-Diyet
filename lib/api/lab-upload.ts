import type { RouteContext } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";
import type { StoredLabDocument } from "@/lib/persistence/v1-boundary";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8_000_000;

export type ParsedLabUpload = { document: StoredLabDocument; bytes: Uint8Array };

/**
 * Shared intake for the lab-photo upload route — validate, store bytes, then persist metadata.
 * If metadata persistence fails after the object was written, remove the object immediately so a
 * sensitive orphan cannot remain in storage without a database pointer.
 */
export async function parseLabPhotoUpload(request: Request, context: RouteContext): Promise<ParsedLabUpload> {
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
  const storageKey = `${context.subject}/lab-document/${crypto.randomUUID()}`;
  const storage = getMediaStorage();
  await storage.put(storageKey, bytes, mimeType);
  try {
    const document = await context.service.recordLabDocument({
      mimeType: mimeType as StoredLabDocument["mimeType"],
      byteSize: bytes.length,
      storageKey,
    });
    return { document, bytes };
  } catch (error) {
    try {
      await storage.delete(storageKey);
    } catch {
      // Preserve the original persistence error; storage cleanup can be retried by operational
      // tooling using the deterministic subject/lab-document prefix.
    }
    throw error;
  }
}
