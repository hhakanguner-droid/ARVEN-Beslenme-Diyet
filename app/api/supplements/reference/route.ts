import { routeErrorResponse } from "@/lib/api/route-context";
import { lookupSupplementReferenceNote } from "@/lib/supplements/reference";

/**
 * Deterministic, non-AI lookup — see lib/supplements/reference.ts's doc comment. No auth context is
 * needed here since the response depends only on the query string, not on anything user-owned.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name || !name.trim()) return Response.json({ error: "name is required" }, { status: 400 });
    return Response.json({ note: lookupSupplementReferenceNote(name) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
