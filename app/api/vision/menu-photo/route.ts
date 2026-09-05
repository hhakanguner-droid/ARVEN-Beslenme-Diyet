import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parsePhotoUpload, toBase64 } from "@/lib/api/vision-upload";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";

/**
 * Menu-photo analysis: informational only, no persistence side effects beyond the photo metadata
 * itself — the ranked list is shown to the user, who may then log whatever they pick through the
 * existing `FoodPicker` flow, exactly as with the meal-photo route.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const { asset, bytes } = await parsePhotoUpload(request, context, "menu-photo");

    const provider = getOptionalAiProvider();
    if (!provider) {
      return Response.json({ photoAssetId: asset.id, analysis: null, aiAvailable: false });
    }

    try {
      const aiContext = await buildAiContext(context);
      const analysis = await provider.analyzeMenuPhoto({
        systemPrompt: renderSystemPrompt(aiContext),
        imageBase64: toBase64(bytes),
        mimeType: asset.mimeType,
      });
      return Response.json({ photoAssetId: asset.id, analysis, aiAvailable: true });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return Response.json({ photoAssetId: asset.id, analysis: null, aiAvailable: true, error: error.code });
      }
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
