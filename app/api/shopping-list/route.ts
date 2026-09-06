import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** The authenticated subject's shopping-list rows for one week, most recently generated first. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const url = new URL(request.url);
    const weekStartLocalDate = url.searchParams.get("weekStartLocalDate");
    if (!weekStartLocalDate) return Response.json({ error: "weekStartLocalDate is required" }, { status: 400 });
    return Response.json({ items: await context.service.listShoppingListItems(weekStartLocalDate) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * Regenerates this week's shopping list from the current weekly plan (live recipe/food data) minus
 * pantry stock — see `generateShoppingList`'s doc comment. Always fully replaces the previous list.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body = (await request.json().catch(() => ({}))) as { weekStartLocalDate?: unknown };
    if (typeof body.weekStartLocalDate !== "string") return Response.json({ error: "weekStartLocalDate is required" }, { status: 400 });
    const items = await context.service.generateShoppingList(body.weekStartLocalDate);
    return Response.json({ items });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
