import { buildTodayPayload, resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";

/**
 * Confirm/reject endpoint for AI-proposed actions created by `/api/ai/chat` (water-log only in
 * this phase — see docs/ROADMAP.md Phase 4 scope note). Reuses the exact same
 * `decideAiAction`/`applyConfirmedAiAction` lifecycle Phase 1 already built for every other AI
 * proposal in this app; nothing new is added to that machinery here.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const body: unknown = await request.json().catch(() => ({}));
    const { actionId, decision } = body as { actionId?: unknown; decision?: unknown };
    if (typeof actionId !== "string" || !actionId.trim()) {
      return Response.json({ error: "actionId is required" }, { status: 400 });
    }
    if (decision !== "confirmed" && decision !== "rejected") {
      return Response.json({ error: "decision must be confirmed or rejected" }, { status: 400 });
    }

    await context.service.decideAiAction(actionId, decision);
    if (decision === "rejected") return Response.json({ outcome: "rejected" });

    await context.service.applyConfirmedAiAction(actionId);
    return Response.json({ outcome: "applied", ...(await buildTodayPayload(context)) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
