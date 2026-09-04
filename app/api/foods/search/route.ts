import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1FoodReadRepository } from "@/lib/persistence/read-repositories";

/** Verified-catalog food search by name, e.g. `/api/foods/search?q=yogurt`. */
export async function GET(request: Request) {
  try {
    const { subject, runner } = await resolveRouteContext(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const foods = await new V1FoodReadRepository(runner).searchVerified(subject, query, { limit: 20 });
    return Response.json({ foods });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
