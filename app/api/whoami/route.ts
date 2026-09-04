import { getAuthenticatedSubject, UnauthenticatedError } from "@/lib/identity/request-subject";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const subject = await getAuthenticatedSubject(request);
    return Response.json({ subject }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return Response.json({ error: "unauthenticated" }, { status: 401, headers: { "cache-control": "no-store, max-age=0" } });
    }
    throw error;
  }
}
