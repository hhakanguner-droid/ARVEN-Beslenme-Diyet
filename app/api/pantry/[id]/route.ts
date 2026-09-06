import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

type PantryItemUpdateBody = { quantityGrams?: unknown; quantityNote?: unknown };

/** Edits only the quantity of an existing pantry item. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as PantryItemUpdateBody;
    const item = await context.service.updatePantryItem(id, { quantityGrams: body.quantityGrams ?? null, quantityNote: body.quantityNote ?? null });
    return Response.json({ item });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** User-initiated forget. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    await context.service.deletePantryItem(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
