import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/**
 * Ayarlar → Yapay Zeka: whether the authenticated subject has saved their own AI provider API key,
 * when it was last saved, and a last-4-characters hint — never the key itself. See
 * `V1MutationService.getAiProviderKeyStatus`'s doc comment for the never-leak-the-key guarantee.
 */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ status: await context.service.getAiProviderKeyStatus() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type SaveApiKeyBody = { apiKey?: unknown };

/** Saves (inserts or overwrites) the authenticated subject's own AI provider API key. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as SaveApiKeyBody;
    const status = await context.service.setAiProviderApiKey({ apiKey: body.apiKey });
    return Response.json({ status });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** User-initiated forget: clears the saved key so this subject's AI calls fall back to the server's own key (if any is configured). */
export async function DELETE(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    await context.service.clearAiProviderApiKey();
    return Response.json({ status: await context.service.getAiProviderKeyStatus() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
