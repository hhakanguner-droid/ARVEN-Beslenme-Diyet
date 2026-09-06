import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

type PantryItemBody = { foodVersionId?: unknown; label?: unknown; quantityGrams?: unknown; quantityNote?: unknown };

/** Every pantry item ("Kilerim") for the authenticated subject, most recent first. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json({ items: await context.service.listPantryItems() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Adds one pantry item, optionally linked to a verified food for automatic shopping-list matching. */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as PantryItemBody;
    const item = await context.service.addPantryItem({
      foodVersionId: body.foodVersionId ?? null,
      label: body.label,
      quantityGrams: body.quantityGrams ?? null,
      quantityNote: body.quantityNote ?? null,
    });
    return Response.json({ item });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
