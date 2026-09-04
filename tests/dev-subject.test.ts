import assert from "node:assert/strict";
import test from "node:test";
import { getAuthenticatedSubjectForRoute } from "../lib/identity/dev-subject";

function requestWithoutAssertion(): { headers: Headers } {
  return { headers: new Headers() };
}

test("dev fallback resolves a stable local subject when no Cloudflare Access assertion is present and NODE_ENV is not production", async () => {
  const original = process.env.NODE_ENV;
  const originalSubject = process.env.ARVEN_DEV_SUBJECT;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  delete process.env.ARVEN_DEV_SUBJECT;
  try {
    const subject = await getAuthenticatedSubjectForRoute(requestWithoutAssertion());
    assert.equal(subject, "local-dev-user");
    // Idempotent / stable across calls, matching a real authenticated subject's behavior.
    assert.equal(await getAuthenticatedSubjectForRoute(requestWithoutAssertion()), subject);
  } finally {
    (process.env as { NODE_ENV?: string }).NODE_ENV = original;
    if (originalSubject !== undefined) process.env.ARVEN_DEV_SUBJECT = originalSubject;
  }
});

test("dev fallback honors ARVEN_DEV_SUBJECT when set", async () => {
  const original = process.env.NODE_ENV;
  const originalSubject = process.env.ARVEN_DEV_SUBJECT;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  process.env.ARVEN_DEV_SUBJECT = "second-local-dev-user";
  try {
    assert.equal(await getAuthenticatedSubjectForRoute(requestWithoutAssertion()), "second-local-dev-user");
  } finally {
    (process.env as { NODE_ENV?: string }).NODE_ENV = original;
    if (originalSubject === undefined) delete process.env.ARVEN_DEV_SUBJECT; else process.env.ARVEN_DEV_SUBJECT = originalSubject;
  }
});

test("dev fallback never activates when NODE_ENV is production — a missing assertion still fails closed", async () => {
  const original = process.env.NODE_ENV;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
  try {
    await assert.rejects(() => getAuthenticatedSubjectForRoute(requestWithoutAssertion()), /Missing Cloudflare Access assertion/);
  } finally {
    (process.env as { NODE_ENV?: string }).NODE_ENV = original;
  }
});
