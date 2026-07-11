import assert from "node:assert/strict";
import test from "node:test";
import { resolveRootRelativeRedirect } from "../lib/http/safe-redirect.ts";

const requestUrl = new URL("https://watch.example/auth/callback?code=test");

test("resolves root-relative paths on the request origin", () => {
  const destination = resolveRootRelativeRedirect(requestUrl, "/dashboard?tab=market#top");

  assert.equal(destination.href, "https://watch.example/dashboard?tab=market#top");
});

test("falls back to the origin root for missing or non-root-relative paths", () => {
  assert.equal(resolveRootRelativeRedirect(requestUrl, null).href, "https://watch.example/");
  assert.equal(resolveRootRelativeRedirect(requestUrl, "dashboard").href, "https://watch.example/");
  assert.equal(resolveRootRelativeRedirect(requestUrl, "https://watch.example/dashboard").href, "https://watch.example/");
});

test("rejects protocol-relative and backslash-based cross-origin redirects", () => {
  assert.equal(resolveRootRelativeRedirect(requestUrl, "//evil.example/path").href, "https://watch.example/");
  assert.equal(resolveRootRelativeRedirect(requestUrl, "/\\evil.example/path").href, "https://watch.example/");

  const encodedAttack = new URL(
    "https://watch.example/auth/callback?next=/%5Cevil.example"
  ).searchParams.get("next");
  assert.equal(resolveRootRelativeRedirect(requestUrl, encodedAttack).href, "https://watch.example/");
});

test("rejects paths containing URL control characters", () => {
  assert.equal(resolveRootRelativeRedirect(requestUrl, "/safe\nLocation: https://evil.example").href, "https://watch.example/");
});
