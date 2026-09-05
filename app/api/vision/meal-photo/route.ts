import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parsePhotoUpload, toBase64 } from "@/lib/api/vision-upload";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";

/**
 * Meal-photo estimate: stores the photo, then (when a provider is configured) asks it to name the
 * foods it sees. The estimate is informational only — the client feeds each `foodQuery` into the
 * existing `FoodPicker` search/match/log flow, so "user correction" and "deterministic
 * recalculation after correction" are handled by that already-existing, already-tested flow rather
 * than any new code here.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const { asset, bytes } = await parsePhotoUpload(request, context, "meal-photo");

    const provider = getOptionalAiProvider();
    if (!provider) {
      return Response.json({ photoAssetId: asset.id, estimate: null, aiAvailable: false });
    }

    try {
      const aiContext = await buildAiContext(context);
      const estimate = await provider.analyzeMealPhoto({
        systemPrompt: renderSystemPrompt(aiContext),
        imageBase64: toBase64(bytes),
        mimeType: asset.mimeType,
      });
      return Response.json({ photoAssetId: asset.id, estimate, aiAvailable: true });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return Response.json({ photoAssetId: asset.id, estimate: null, aiAvailable: true, error: error.code });
      }
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
