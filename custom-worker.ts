/**
 * Worker entry point referenced by `wrangler.jsonc`'s `main`.
 *
 * `wrangler`'s Durable Object migrations resolve a class by name against
 * whatever this entry module exports, so `UserDurableObject` must be
 * re-exported here regardless of how request routing evolves.
 *
 * The `fetch` handler below is a placeholder. Real Next.js request handling
 * is a separate, deliberately deferred follow-up: it needs the
 * `@opennextjs/cloudflare` build adapter (which turns the Next.js build into
 * a Worker-compatible handler) wired in and built, which did not happen in
 * this slice. Until then, this Worker exists to let `wrangler deploy`
 * publish the Durable Object class and its D1 binding without pretending
 * the product is actually served from here yet.
 */
import { UserDurableObject } from "@/lib/persistence/user-durable-object";

export { UserDurableObject };

export default {
  async fetch(): Promise<Response> {
    return new Response(
      "ARVEN Worker scaffold: Next.js request handling is not wired in yet (needs @opennextjs/cloudflare).",
      { status: 501 },
    );
  },
};
