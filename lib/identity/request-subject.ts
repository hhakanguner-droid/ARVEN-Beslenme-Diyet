import {
  createCloudflareAccessVerifier,
  type CloudflareAccessVerifier,
} from "./cloudflare-access";

export class UnauthenticatedError extends Error {
  constructor(message = "Request is not authenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

const ACCESS_HEADER = "cf-access-jwt-assertion";
const ACCESS_COOKIE = "CF_Authorization";

/** Reads the Cloudflare Access JWT from the header Access injects, falling back to its cookie. */
export function extractAccessAssertion(request: { headers: Headers }): string | null {
  const header = request.headers.get(ACCESS_HEADER);
  if (header && header.trim()) return header.trim();

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === ACCESS_COOKIE) {
      const value = rawValue.join("=").trim();
      return value || null;
    }
  }
  return null;
}

let productionVerifier: CloudflareAccessVerifier | null = null;

function getProductionVerifier(): CloudflareAccessVerifier {
  if (productionVerifier) return productionVerifier;
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUDIENCE;
  if (!teamDomain || !audience) {
    throw new Error("CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUDIENCE must be configured to verify Cloudflare Access requests");
  }
  productionVerifier = createCloudflareAccessVerifier({ teamDomain, audience });
  return productionVerifier;
}

/**
 * Resolves the authenticated external subject for one request. `deps.verifier`
 * is the seam tests use to inject a local-JWKS verifier instead of the
 * env-configured production one.
 */
export async function getAuthenticatedSubject(
  request: { headers: Headers },
  deps?: { verifier?: CloudflareAccessVerifier },
): Promise<string> {
  const token = extractAccessAssertion(request);
  if (!token) throw new UnauthenticatedError("Missing Cloudflare Access assertion");

  const verifier = deps?.verifier ?? getProductionVerifier();
  try {
    const identity = await verifier.verify(token);
    return identity.subject;
  } catch (error) {
    throw new UnauthenticatedError(error instanceof Error ? error.message : "Cloudflare Access verification failed");
  }
}
