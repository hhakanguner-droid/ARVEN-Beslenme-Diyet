import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { CloudflareAccessVerificationError, verifyCloudflareAccessJwt } from "../lib/identity/cloudflare-access";
import { extractAccessAssertion } from "../lib/identity/request-subject";

const AUDIENCE = "test-audience";
const ISSUER = "https://example.cloudflareaccess.com";
const KEY_ID = "test-key";

async function buildTestJwks() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = KEY_ID;
  return { privateKey: privateKey as CryptoKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

function signToken(privateKey: CryptoKey, claims: Record<string, unknown>, options: { audience?: string; issuer?: string; expiresIn?: string | number } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? "10m")
    .sign(privateKey);
}

test("verifies a valid Cloudflare Access token and extracts subject/email", async () => {
  const { privateKey, jwks } = await buildTestJwks();
  const token = await signToken(privateKey, { sub: "user-123", email: "user@example.com" });
  const identity = await verifyCloudflareAccessJwt(token, jwks, { audience: AUDIENCE, issuer: ISSUER });
  assert.equal(identity.subject, "user-123");
  assert.equal(identity.email, "user@example.com");
  assert.ok(identity.expiresAt.getTime() > identity.issuedAt.getTime());
});

test("subject defaults to null email when the claim is absent", async () => {
  const { privateKey, jwks } = await buildTestJwks();
  const token = await signToken(privateKey, { sub: "user-123" });
  const identity = await verifyCloudflareAccessJwt(token, jwks, { audience: AUDIENCE, issuer: ISSUER });
  assert.equal(identity.email, null);
});

test("rejects a token issued for a different audience", async () => {
  const { privateKey, jwks } = await buildTestJwks();
  const token = await signToken(privateKey, { sub: "user-123" }, { audience: "other-audience" });
  await assert.rejects(
    () => verifyCloudflareAccessJwt(token, jwks, { audience: AUDIENCE, issuer: ISSUER }),
    (error: unknown) => error instanceof CloudflareAccessVerificationError && error.code === "audience-mismatch",
  );
});

test("rejects an expired token", async () => {
  const { privateKey, jwks } = await buildTestJwks();
  const token = await signToken(privateKey, { sub: "user-123" }, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
  await assert.rejects(
    () => verifyCloudflareAccessJwt(token, jwks, { audience: AUDIENCE, issuer: ISSUER }),
    (error: unknown) => error instanceof CloudflareAccessVerificationError && error.code === "expired",
  );
});

test("rejects a token with a tampered signature", async () => {
  const { privateKey, jwks } = await buildTestJwks();
  const token = await signToken(privateKey, { sub: "user-123" });
  const tampered = `${token.slice(0, -4)}abcd`;
  await assert.rejects(
    () => verifyCloudflareAccessJwt(tampered, jwks, { audience: AUDIENCE, issuer: ISSUER }),
    (error: unknown) => error instanceof CloudflareAccessVerificationError && error.code === "invalid-token",
  );
});

test("rejects a token missing the subject claim", async () => {
  const { privateKey, jwks } = await buildTestJwks();
  const token = await signToken(privateKey, {});
  await assert.rejects(
    () => verifyCloudflareAccessJwt(token, jwks, { audience: AUDIENCE, issuer: ISSUER }),
    (error: unknown) => error instanceof CloudflareAccessVerificationError && error.code === "invalid-token",
  );
});

test("rejects an empty token without touching the key set", async () => {
  const { jwks } = await buildTestJwks();
  await assert.rejects(
    () => verifyCloudflareAccessJwt("", jwks, { audience: AUDIENCE, issuer: ISSUER }),
    (error: unknown) => error instanceof CloudflareAccessVerificationError && error.code === "missing-token",
  );
});

test("extractAccessAssertion prefers the header over the cookie", () => {
  const headers = new Headers({ "cf-access-jwt-assertion": "header-token", cookie: "CF_Authorization=cookie-token" });
  assert.equal(extractAccessAssertion({ headers }), "header-token");
});

test("extractAccessAssertion falls back to the CF_Authorization cookie", () => {
  const headers = new Headers({ cookie: "other=1; CF_Authorization=cookie-token; more=2" });
  assert.equal(extractAccessAssertion({ headers }), "cookie-token");
});

test("extractAccessAssertion returns null when neither header nor cookie is present", () => {
  assert.equal(extractAccessAssertion({ headers: new Headers() }), null);
});
