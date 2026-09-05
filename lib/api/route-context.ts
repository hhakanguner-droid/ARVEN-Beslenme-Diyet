import { getAuthenticatedSubjectForRoute } from "@/lib/identity/dev-subject";
import { getLocalRunner } from "@/lib/persistence/local-runtime";
import { V1NutritionReadRepository } from "@/lib/persistence/read-repositories";
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

type MealEventItemPayload = { foodName: string; nutrition: { energyKcal: number } };
type MealEventPayload = { schemaVersion: "MealEventV1"; mealType: string; items: MealEventItemPayload[] };
type WaterEventPayload = { schemaVersion: "WaterEventV1"; milliliters: number };

export type TodayEventSummary = {
  id: string;
  type: "meal-log" | "water-log";
  occurredAt: string;
  mealType?: string;
  summary: string;
};

/** Small UI-facing summary of one logged event, used for "bugün ne kaydettim" / undo. Route-level presentation built off `listNutritionEventsForLocalDate` — deliberately not part of the read-only `NutritionReadRepository` contract, which only ever returns aggregates. */
function summarizeEvent(event: { id: string; eventType: string; occurredAt: string; payloadJson: string }): TodayEventSummary | null {
  try {
    if (event.eventType === "meal-log") {
      const payload = JSON.parse(event.payloadJson) as MealEventPayload;
      const names = (payload.items ?? []).map((item) => item.foodName).join(", ");
      return { id: event.id, type: "meal-log", occurredAt: event.occurredAt, mealType: payload.mealType, summary: names || "Öğün" };
    }
    if (event.eventType === "water-log") {
      const payload = JSON.parse(event.payloadJson) as WaterEventPayload;
      return { id: event.id, type: "water-log", occurredAt: event.occurredAt, summary: `${payload.milliliters} ml su` };
    }
  } catch {
    return null;
  }
  return null;
}

/** Shared response body for `/api/today`, `/api/water`, and `/api/meals`: today's aggregate snapshot plus today's individual log entries (for the undo list). */
export async function buildTodayPayload(context: RouteContext) {
  const { subject, runner, todayLocalDate } = context;
  const [snapshot, rawEvents] = await Promise.all([
    new V1NutritionReadRepository(runner).getDailySnapshot(subject, todayLocalDate),
    runner.transaction((tx) => tx.listNutritionEventsForLocalDate(subject, todayLocalDate)),
  ]);
  const events = rawEvents.map(summarizeEvent).filter((event): event is TodayEventSummary => event !== null);
  return { ...snapshot, events };
}
