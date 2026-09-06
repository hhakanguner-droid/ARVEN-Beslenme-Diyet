import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getAiUsageSummary } from "@/lib/ai/telemetry";

/**
 * Operational visibility only (Faz 9 — "cost telemetry"): this process's running AI token usage and
 * an approximate cost estimate since last restart. Requires authentication like every other route
 * here, but is deliberately not user-scoped — there is exactly one shared AI provider account, not
 * one per user, so there is nothing to filter by subject.
 */
export async function GET(request: Request) {
  try {
    await resolveRouteContext(request);
    return Response.json(getAiUsageSummary());
  } catch (error) {
    return routeErrorResponse(error);
  }
}
