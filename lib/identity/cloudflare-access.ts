import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type CloudflareAccessVerificationCode =
  | "missing-token"
  | "invalid-token"
  | "expired"
  | "audience-mismatch";

export class CloudflareAccessVerificationError extends Error {
  constructor(readonly code: CloudflareAccessVerificationCode, message: string) {
    super(message);
    this.name = "CloudflareAccessVerificationError";
  }
}

export type CloudflareAccessIdentity = {
  subject: string;
  email: string | null;
  issuedAt: Date;
  expiresAt: Date;
};

/**
 * Pure verification core: takes an injected key-getter so it can be fully
 * unit-tested offline (a locally generated key pair + local JWKS), without
 * reaching Cloudflare's network endpoint.
 */
export async function verifyCloudflareAccessJwt(
  token: string,
  jwks: JWTVerifyGetKey,
  options: { audience: string; issuer?: string },
): Promise<CloudflareAccessIdentity> {
  if (!token.trim()) {
    throw new CloudflareAccessVerificationError("missing-token", "Cloudflare Access assertion is empty");
  }

  let result: Awaited<ReturnType<typeof jwtVerify>>;
  try {
    result = await jwtVerify(token, jwks, {
      audience: options.audience,
      issuer: options.issuer,
    });
  } catch (error) {
    const code: CloudflareAccessVerificationCode = error instanceof Error && error.name === "JWTExpired"
      ? "expired"
      : error instanceof Error && error.name === "JWTClaimValidationFailed" && (error as { claim?: string }).claim === "aud"
        ? "audience-mismatch"
        : "invalid-token";
    const message = error instanceof Error ? error.message : "Cloudflare Access assertion failed verification";
    throw new CloudflareAccessVerificationError(code, message);
  }
  const { payload } = result;

  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new CloudflareAccessVerificationError("invalid-token", "Cloudflare Access assertion is missing a subject claim");
  }
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    throw new CloudflareAccessVerificationError("invalid-token", "Cloudflare Access assertion is missing exp/iat claims");
  }

  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
  };
}

export type CloudflareAccessVerifier = { verify(token: string): Promise<CloudflareAccessIdentity> };

/**
 * Production wrapper: fetches Cloudflare Access's per-team JWKS
 * (https://<team-domain>/cdn-cgi/access/certs) and caches/dedupes lookups via
 * jose's built-in remote JWKS handling.
 */
export function createCloudflareAccessVerifier(config: { teamDomain: string; audience: string }): CloudflareAccessVerifier {
  const teamDomain = config.teamDomain.trim();
  if (!teamDomain) throw new Error("Cloudflare Access team domain is required");
  const audience = config.audience.trim();
  if (!audience) throw new Error("Cloudflare Access audience is required");

  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  const issuer = `https://${teamDomain}`;

  return {
    verify: (token: string) => verifyCloudflareAccessJwt(token, jwks, { audience, issuer }),
  };
}
