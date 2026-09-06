import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Same source-inspection pattern as `phase6-boundary-regressions.test.ts` — pins the exact safety wording/ordering in these Faz 9 routes so a future edit cannot silently loosen them without a visible test failure. */
function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("account deletion requires the exact confirmation phrase and never trusts a body-supplied subject", () => {
  const route = source("app/api/account/route.ts");
  assert.match(route, /body\.confirm !== "HESABIMI SIL"/);
  assert.match(route, /status: 400/);
  // The route must resolve the subject from the authenticated route context, never from the request body.
  assert.doesNotMatch(route, /body\.(userSubject|subject|ownerSubject)/);
});

test("account deletion deletes every media object before purging the account row (never the reverse)", () => {
  const route = source("app/api/account/route.ts");
  const deleteMediaIndex = route.indexOf("storage.delete(asset.storageKey)");
  const deleteAccountIndex = route.indexOf("context.service.deleteAccount()");
  assert.ok(deleteMediaIndex >= 0 && deleteAccountIndex >= 0, "both steps must be present");
  assert.ok(deleteMediaIndex < deleteAccountIndex, "media bytes must be deleted before the account row that addressed them is purged");
});

test("export/import routes always scope to the authenticated context, never to a caller-supplied user id", () => {
  const route = source("app/api/export/route.ts");
  assert.match(route, /buildUserExport\(context\.runner, context\.subject, context\.userContext/);
  assert.match(route, /importUserExport\(context\.runner, context\.subject, raw\)/);
  assert.doesNotMatch(route, /request\.(json\(\))?\.(userSubject|subject|ownerSubject)/);
});

test("importUserExport never re-inserts rows from the media-manifest section, and never trusts a userSubject/ownerSubject field from the uploaded file", () => {
  const importModule = source("lib/portability/import.ts");
  assert.match(importModule, /skipped\["media-manifest"\] = raw\.mediaManifest\.length/);
  assert.doesNotMatch(importModule, /raw\.userSubject/);
  assert.doesNotMatch(importModule, /raw\.ownerSubject/);
  // Every insert must be built with the authenticated `subject`, never anything read off the file.
  assert.match(importModule, /userSubject: subject/);
});
