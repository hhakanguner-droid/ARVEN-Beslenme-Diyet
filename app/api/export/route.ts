import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { buildUserExport } from "@/lib/portability/export";
import { importUserExport } from "@/lib/portability/import";

/**
 * Full versioned JSON backup for the authenticated subject (`docs/PORTABILITY.md`, Faz 9). Every
 * read is scoped to `context.subject` by the transaction layer underneath `buildUserExport` — this
 * route never accepts a target user, so it can only ever produce the caller's own data.
 */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const payload = await buildUserExport(context.runner, context.subject, context.userContext, "tr-TR", new Date());
    const body = JSON.stringify(payload, null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="arven-yedek-${context.todayLocalDate}.json"`,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * Restores a previously downloaded backup for the authenticated subject. Always writes into
 * `context.subject`'s own storage, regardless of anything the uploaded file claims about ownership
 * (see `importUserExport`'s doc comment for the full set of import-safety guarantees).
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const raw = await request.json().catch(() => null);
    if (raw === null) return Response.json({ error: "Geçerli bir JSON yedek dosyası gönderilmedi" }, { status: 400 });
    const summary = await importUserExport(context.runner, context.subject, raw);
    return Response.json({ summary });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
