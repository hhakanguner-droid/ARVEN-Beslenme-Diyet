import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parseLabPhotoUpload } from "@/lib/api/lab-upload";
import { toBase64 } from "@/lib/api/vision-upload";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";
import { parseSafeLabExtraction } from "@/lib/health-safety/lab-extraction";
import { getFlowsForTrigger } from "@/lib/privacy/data-flows";

const LAB_AI_CONSENT_HEADER = "x-arven-lab-ai-consent";
const LAB_EXTRACTION_SYSTEM_PROMPT = [
  "You are a transcription component for ARVEN.",
  "Read only the visible laboratory report text in the supplied image.",
  "Return marker name, value, unit, reference range and uncertainty using the required structured schema.",
  "Do not diagnose, interpret, recommend treatment, mention medication changes, or use any information that is not visible in the image.",
].join("\n");

/**
 * Lab-photo extraction: when an external AI provider is configured, consent is checked before the
 * sensitive file is persisted or transmitted. Only the image plus a minimal transcription prompt
 * is sent externally; ARVEN profile, allergy, diet and memory context are deliberately excluded.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const provider = getOptionalAiProvider();

    if (provider) {
      const declaredFlows = getFlowsForTrigger("lab-extraction");
      if (declaredFlows.length === 0 || declaredFlows.some((flow) => flow.consentMode !== "explicit-opt-in")) {
        return Response.json({ error: "lab-ai-data-flow-not-declared" }, { status: 503 });
      }
      if (request.headers.get(LAB_AI_CONSENT_HEADER) !== "1") {
        return Response.json({ error: "lab-ai-consent-required", aiAvailable: true }, { status: 403 });
      }
    }

    const { document, bytes } = await parseLabPhotoUpload(request, context);

    if (!provider) {
      return Response.json({ labDocumentId: document.id, entries: [], aiAvailable: false });
    }

    try {
      const rawExtraction = await provider.extractLabResult({
        systemPrompt: LAB_EXTRACTION_SYSTEM_PROMPT,
        imageBase64: toBase64(bytes),
        mimeType: document.mimeType,
      });
      let extraction;
      try {
        extraction = parseSafeLabExtraction(rawExtraction);
      } catch (error) {
        throw new AiProviderError("invalid-reply", error instanceof Error ? error.message : "Unsafe or invalid lab extraction");
      }
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
