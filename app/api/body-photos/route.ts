import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { parseBodyPhotoUpload } from "@/lib/progress/body-photo-upload";

/** Every body-progress photo for the authenticated subject, most recent first. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ photos: await context.service.listBodyPhotoSets() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Uploads one body-progress photo (`multipart/form-data`: `photo`, `localDate`, optional `angle`). */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const photo = await parseBodyPhotoUpload(request, context);
    return Response.json({ photo });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
