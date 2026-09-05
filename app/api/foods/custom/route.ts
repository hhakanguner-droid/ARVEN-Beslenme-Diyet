import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** "Kendi yemeğini oluştur": a plain manually-entered food, private to this user (owner-scoped in the shared catalog). */
export async function POST(request: Request) {
  try {
    const { service } = await resolveRouteContext(request);
    const body: unknown = await request.json().catch(() => ({}));
    const food = await service.createCustomFood({ schemaVersion: "CustomFoodV1", ...(body as object) });
    return Response.json({ food });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
