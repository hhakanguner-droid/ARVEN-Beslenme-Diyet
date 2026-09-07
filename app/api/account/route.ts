import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getMediaStorage } from "@/lib/media/storage";

/**
 * Permanently deletes the authenticated account (Faz 9: closes the gap `purgeAuthenticatedUser`'s
 * doc comment flagged as "Phase 9 scope" — that call deletes every metadata row but never the
 * private-object bytes those rows pointed at). This route deletes every byte object first — meal
 * photos, lab documents, body-progress photos, generated PDF reports — then purges the metadata and
 * every other row in one transaction, same media-then-metadata ordering as `/api/photos/[id]`
 * DELETE. If a byte deletion fails partway through, the account row is deliberately left intact
 * (the request fails and can be retried) rather than leaving a half-deleted account with dangling
 * media references.
 *
 * Faz 9 hardening: `beginAccountDeletion()` runs FIRST, before this subject's media is even listed.
 * From that point on, `V1MutationService.recordPhotoAsset`/`recordLabDocument`/`recordBodyPhotoSet`/
 * `recordProgressReportExport` fail closed for this subject (see
 * `V1Transaction.beginAccountDeletion`'s doc comment) — closing the race where a concurrent upload
 * could land a new object after the listing above but before this route finishes deleting bytes,
 * leaving it orphaned with no metadata row. `beginAccountDeletion` is idempotent, so a client retry
 * after a partial storage-delete failure below reuses the same tombstone rather than erroring or
 * resetting; storage deletion itself is best-effort per object (already-deleted keys are a no-op)
 * so a retry safely re-attempts only what is left.
 *
 * Requires `{"confirm":"HESABIMI SIL"}` in the body — deliberately not a bare DELETE with no body —
 * so a client cannot trigger this irreversibly from a single stray tap/request.
 */
export async function DELETE(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== "HESABIMI SIL") {
      return Response.json({ error: 'Onay için gövdede confirm alanı tam olarak "HESABIMI SIL" olmalı' }, { status: 400 });
    }

    await context.service.beginAccountDeletion();

    const [photos, labDocuments, bodyPhotos, reports] = await Promise.all([
      context.service.listPhotoAssets(),
      context.service.listLabDocuments(),
      context.service.listBodyPhotoSets(),
      context.service.listProgressReportExports(),
    ]);
    const storage = getMediaStorage();
    const failures: Array<{ storageKey: string; message: string }> = [];
    for (const asset of [...photos, ...labDocuments, ...bodyPhotos, ...reports]) {
      try {
        await storage.delete(asset.storageKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ storageKey: asset.storageKey, message });
        // No persisted telemetry pipeline exists in this app (see docs/PHASE9_PORTABILITY_AND_HARDENING.md's
        // "explicitly out of scope" section) — this structured log is the traceability this failure gets.
        // The deletion tombstone set above is deliberately left in place either way, so new media stays
        // rejected until a retry of this same request finishes the job.
        console.error("[account-deletion] storage delete failed; deletion stays in progress and can be retried", { subject: context.subject, storageKey: asset.storageKey, error: message });
      }
    }
    if (failures.length > 0) {
      throw new Error(`Hesap silme tamamlanamadı: ${failures.length} medya dosyası silinemedi. İşlem tekrar denenebilir.`);
    }

    await context.service.deleteAccount();
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
