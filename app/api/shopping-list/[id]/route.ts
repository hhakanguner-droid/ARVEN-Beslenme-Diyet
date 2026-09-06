import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

type ShoppingListCheckedBody = { isChecked?: unknown };

/** Toggles one shopping-list item checked/unchecked while the user is out shopping. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as ShoppingListCheckedBody;
    if (typeof body.isChecked !== "boolean") return Response.json({ error: "isChecked must be a boolean" }, { status: 400 });
    await context.service.setShoppingListItemChecked(id, body.isChecked);
    return Response.json({ updated: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
