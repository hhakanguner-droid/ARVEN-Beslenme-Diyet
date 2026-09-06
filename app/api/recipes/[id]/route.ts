import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** One recipe belonging to the authenticated subject, or null. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    return Response.json({ recipe: await context.service.getRecipe(id) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** User-initiated forget. A weekly plan that already referenced this recipe keeps its frozen display snapshot — see `deleteRecipe`'s doc comment. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    await context.service.deleteRecipe(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
