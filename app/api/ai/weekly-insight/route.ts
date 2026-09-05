import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import { AiProviderError, getOptionalAiProvider } from "@/lib/ai/provider";
import { computeWeeklyMetrics } from "@/lib/nutrition/weekly-metrics";
import { assertCanonicalLocalDate, previousLocalDate } from "@/lib/time/canonical";

function defaultWeekStart(todayLocalDate: string): string {
  let date = todayLocalDate;
  for (let i = 0; i < 6; i++) date = previousLocalDate(date);
  return date;
}

/**
 * Weekly review: always returns the deterministic metrics (never blocked on the AI provider),
 * plus a cached or freshly generated narrative when a provider is configured. A generated
 * narrative is persisted as a snapshot so re-opening this same week never re-runs the model or
 * silently changes its wording later (see db/migrations/0004_phase4_ai.sql).
 */
export async function GET(request: Request) {
  try {
    const context = await resolveRouteContext(request);
    const url = new URL(request.url);
    const requestedWeekStart = url.searchParams.get("weekStart");
    const weekStartLocalDate = requestedWeekStart ?? defaultWeekStart(context.todayLocalDate);
    try {
      assertCanonicalLocalDate(weekStartLocalDate, "weekStart");
    } catch {
      return Response.json({ error: "weekStart must be a canonical local date (YYYY-MM-DD)" }, { status: 400 });
    }

    const metrics = await computeWeeklyMetrics(context.runner, context.subject, weekStartLocalDate);

    const cached = await context.service.getWeeklyInsightSnapshot(weekStartLocalDate);
    if (cached?.narrativeJson) {
      return Response.json({ metrics, narrative: JSON.parse(cached.narrativeJson), aiAvailable: true });
    }

    const provider = getOptionalAiProvider();
    if (!provider) {
      if (!cached) await context.service.recordWeeklyInsightSnapshot(weekStartLocalDate, metrics, null);
      return Response.json({ metrics, narrative: null, aiAvailable: false });
    }

    try {
      const aiContext = await buildAiContext(context);
      const narrative = await provider.generateWeeklyInsight({ systemPrompt: renderSystemPrompt(aiContext), metrics });
      await context.service.recordWeeklyInsightSnapshot(weekStartLocalDate, metrics, narrative);
      return Response.json({ metrics, narrative, aiAvailable: true });
    } catch (error) {
      if (!cached) await context.service.recordWeeklyInsightSnapshot(weekStartLocalDate, metrics, null);
      if (error instanceof AiProviderError) {
        return Response.json({ metrics, narrative: null, aiAvailable: true, error: error.code });
      }
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
