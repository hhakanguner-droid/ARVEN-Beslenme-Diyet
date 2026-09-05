import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parseLabPhotoUpload } from "@/lib/api/lab-upload";
import { toBase64 } from "@/lib/api/vision-upload";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";

/**
 * Lab-photo extraction: stores the document, then (when a provider is configured) transcribes the
 * markers it can read as 'extracted' rows the user must review. Nothing here is treated as the
 * user's confirmed data yet — see /api/lab/entries/[id] for the confirm/edit/reject flow.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const { document, bytes } = await parseLabPhotoUpload(request, context);

    const provider = getOptionalAiProvider();
    if (!provider) {
      return Response.json({ labDocumentId: document.id, entries: [], aiAvailable: false });
    }

    try {
      const aiContext = await buildAiContext(context);
      const extraction = await provider.extractLabResult({
        systemPrompt: renderSystemPrompt(aiContext),
        imageBase64: toBase64(bytes),
        mimeType: document.mimeType,
      });
      const entries = await context.service.recordLabResultEntries(document.id, extraction.entries);
      return Response.json({ labDocumentId: document.id, entries, uncertainty: extraction.uncertainty, aiAvailable: true });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return Response.json({ labDocumentId: document.id, entries: [], aiAvailable: true, error: error.code });
      }
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
