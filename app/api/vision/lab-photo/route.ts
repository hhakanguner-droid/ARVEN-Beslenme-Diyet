import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parseLabPhotoUpload } from "@/lib/api/lab-upload";
import { toBase64 } from "@/lib/api/vision-upload";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";
import { parseSafeLabExtraction } from "@/lib/health-safety/lab-extraction";
import { getFlowsForTrigger } from "@/lib/privacy/data-flows";

const LAB_AI_CONSENT_HEADER = "x-arven-lab-ai-consent";

/**
 * Lab-photo extraction: stores the document, then (when a provider is configured and the user
 * explicitly opts in to this transfer) sends the image to the external AI provider. Extracted
 * rows remain unreviewed until the user confirms them.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const { document, bytes } = await parseLabPhotoUpload(request, context);

    const provider = getOptionalAiProvider();
    if (!provider) {
      return Response.json({ labDocumentId: document.id, entries: [], aiAvailable: false });
    }

    // Fail closed unless the product registry declares this transfer AND this request carries an
    // explicit per-transfer opt-in. This prevents a configured AI key from silently exporting a
    // sensitive lab file. The UI must set the header only after showing the disclosure/consent UI.
    const declaredFlows = getFlowsForTrigger("lab-extraction");
    if (declaredFlows.length === 0 || declaredFlows.some((flow) => flow.consentMode !== "explicit-opt-in")) {
      return Response.json({ error: "lab-ai-data-flow-not-declared", labDocumentId: document.id }, { status: 503 });
    }
    if (request.headers.get(LAB_AI_CONSENT_HEADER) !== "1") {
      return Response.json({ error: "lab-ai-consent-required", labDocumentId: document.id, aiAvailable: true }, { status: 403 });
    }

    try {
      const aiContext = await buildAiContext(context);
      const rawExtraction = await provider.extractLabResult({
        systemPrompt: renderSystemPrompt(aiContext),
        imageBase64: toBase64(bytes),
        mimeType: document.mimeType,
      });
      // Provider output is untrusted even after provider-level schema validation: validate every
      // model-authored field against the health-safety policy before persistence/display.
      const extraction = parseSafeLabExtraction(rawExtraction);
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
