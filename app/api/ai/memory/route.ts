import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/** ARVEN memory list — backs the "ARVEN hafızası" screen at app/(app)/arven/hafiza/page.tsx. */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const facts = await context.service.listMemoryFacts();
    return Response.json({ facts });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** User-initiated forget: deletes exactly one memory fact by id, scoped to the authenticated subject. */
export async function DELETE(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body: unknown = await request.json().catch(() => ({}));
    const id = (body as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    await context.service.deleteMemoryFact(id);
    const facts = await context.service.listMemoryFacts();
    return Response.json({ facts });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
