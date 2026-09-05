import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parsePhotoUpload, toBase64 } from "@/lib/api/vision-upload";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";

/**
 * Product-photo identification: the model only ever proposes a *candidate* name/brand/barcode.
 * No nutrition lookup happens here — the client feeds the candidate into the existing Phase 3
 * `FoodPicker` search/barcode UI (`/api/foods/search`, `/api/foods/barcode`), which is the only
 * source of actual nutrition numbers.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const { asset, bytes } = await parsePhotoUpload(request, context, "product-photo");

    const provider = getOptionalAiProvider();
    if (!provider) {
      return Response.json({ photoAssetId: asset.id, identification: null, aiAvailable: false });
    }

    try {
      const aiContext = await buildAiContext(context);
      const identification = await provider.identifyProductPhoto({
        systemPrompt: renderSystemPrompt(aiContext),
        imageBase64: toBase64(bytes),
        mimeType: asset.mimeType,
      });
      return Response.json({ photoAssetId: asset.id, identification, aiAvailable: true });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return Response.json({ photoAssetId: asset.id, identification: null, aiAvailable: true, error: error.code });
      }
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
