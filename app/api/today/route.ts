import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1NutritionReadRepository } from "@/lib/persistence/read-repositories";

/** "Bugün": today's real daily nutrition snapshot (targets vs. consumed, plus water) for the authenticated user. */
export async function GET(request: Request) {
  try {
    const { subject, runner, todayLocalDate } = await resolveRouteContext(request);
    const repository = new V1NutritionReadRepository(runner);
    const snapshot = await repository.getDailySnapshot(subject, todayLocalDate);
    return Response.json(snapshot);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
