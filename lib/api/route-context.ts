import { getAuthenticatedSubjectForRoute } from "@/lib/identity/dev-subject";
import { getLocalRunner } from "@/lib/persistence/local-runtime";
import {
  V1MutationService,
  deriveNutritionLocalDate,
  type AuthenticatedUserContext,
  type V1TransactionRunner,
} from "@/lib/persistence/v1-boundary";

export type RouteContext = {
  subject: string;
  runner: V1TransactionRunner;
  service: V1MutationService;
  userContext: AuthenticatedUserContext;
  todayLocalDate: string;
};

/**
 * Shared setup for every `app/api/*` route in this slice: resolves the authenticated subject
 * (Cloudflare Access in production, a dev-only fallback locally — see `lib/identity/dev-subject.ts`),
 * opens that subject's local runner, and lazily creates their `users` row on first request.
 * New users default to Europe/Istanbul / tr-TR, matching this Turkish-language product; a real
 * onboarding flow (Phase 2 scope) would let a user override this from their device locale.
 */
export async function resolveRouteContext(request: Request): Promise<RouteContext> {
  const subject = await getAuthenticatedSubjectForRoute(request);
  const runner = getLocalRunner(subject);
  const service = new V1MutationService(subject, runner);
  const userContext = await service.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  const todayLocalDate = deriveNutritionLocalDate(new Date().toISOString(), userContext.timezone, userContext.nutritionDayStartMinutes);
  return { subject, runner, service, userContext, todayLocalDate };
}

/** Uniform error shape for route handlers: validation/business-rule errors become 400s, anything unexpected a 500. */
export function routeErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const isClientError = error instanceof Error && (error.name === "ZodError" || error.name === "ApplicationRejectedError" || /required|invalid|rejects|conflict|must|cannot|Unauthenticated/i.test(message));
  return Response.json({ error: message }, { status: isClientError ? 400 : 500 });
}
