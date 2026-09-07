import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { getAiUsageSummary } from "@/lib/ai/telemetry";

/**
 * Operational visibility only (Faz 9 — "cost telemetry"): this process's running AI token usage and
 * an approximate cost estimate since last restart.
 *
 * BYOK hardening (fix/byok-security-hardening): this used to return the fully unscoped total —
 * fine back when there was exactly one shared AI provider account, but once a user can save their
 * own key (BYOK), that pooled everyone's usage into one number any authenticated user could read,
 * leaking cross-user usage counts. Now scoped to the caller: `getAiUsageSummary(subject)` returns
 * every "shared"-credential call (still pooled — there is still only one shared account) plus only
 * this caller's own "byok" calls, never another subject's.
 */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    return Response.json(getAiUsageSummary(context.subject));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
