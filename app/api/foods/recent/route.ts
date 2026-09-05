import { resolveRouteContext, routeErrorResponse } from "@/lib/api/route-context";
import { V1FoodReadRepository } from "@/lib/persistence/read-repositories";

/** "Son yediklerim": distinct foods this user has meal-logged recently, for one-tap re-add. */
export async function GET(request: Request) {
  try {
    const { subject, runner } = await resolveRouteContext(request);
    const foods = await new V1FoodReadRepository(runner).getRecentlyLogged(subject, 10);
    return Response.json({ foods });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
