import { getAuthenticatedSubject, UnauthenticatedError } from "@/lib/identity/request-subject";

/**
 * Local-development-only fallback subject. Cloudflare Access is not reachable from a plain
 * `next dev`/`next start` process (there is no Access proxy in front of it), so every API route
 * would otherwise 401 on every request until the app is actually deployed behind Cloudflare Access.
 *
 * This fallback activates ONLY when `NODE_ENV !== "production"` — `next build`/`next start` set
 * `NODE_ENV=production`, and so does the real Cloudflare Workers runtime, so production traffic
 * always goes through the real, unmodified `getAuthenticatedSubject` and a missing/invalid Access
 * assertion is still rejected exactly as before. This file changes nothing about that path; it only
 * adds a narrower one that a production build can never reach.
 */
export async function getAuthenticatedSubjectForRoute(request: { headers: Headers }): Promise<string> {
  try {
    return await getAuthenticatedSubject(request);
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) throw error;
    if (process.env.NODE_ENV === "production") throw error;
    // Read lazily (not module-load-time) so it reflects the environment at request time.
    return process.env.ARVEN_DEV_SUBJECT?.trim() || "local-dev-user";
  }
}
