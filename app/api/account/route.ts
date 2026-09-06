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

    const [photos, labDocuments, bodyPhotos, reports] = await Promise.all([
      context.service.listPhotoAssets(),
      context.service.listLabDocuments(),
      context.service.listBodyPhotoSets(),
      context.service.listProgressReportExports(),
    ]);
    const storage = getMediaStorage();
    for (const asset of [...photos, ...labDocuments, ...bodyPhotos, ...reports]) {
      await storage.delete(asset.storageKey);
    }

    await context.service.deleteAccount();
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
