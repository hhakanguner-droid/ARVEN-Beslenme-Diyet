import type { D1Database, DurableObjectState, SqlStorage } from "@cloudflare/workers-types";
import { USER_DURABLE_OBJECT_SCHEMA_V1 } from "@/db/migrations/durable-object/0001_user_schema";
import { USER_DURABLE_OBJECT_PHASE6_HARDENING } from "@/db/migrations/durable-object/0002_phase6_health_hardening";
import { DurableObjectV1Transaction, DurableObjectV1TransactionRunner, type D1LikeQuery, type SyncSqlStorage } from "@/lib/persistence/durable-object-adapter";
import type { V1TransactionRunner } from "@/lib/persistence/v1-boundary";

/** Cloudflare bindings this Durable Object needs. Configured in `wrangler.jsonc`. */
export interface UserDurableObjectEnv {
  /** Shared verified-food catalog: `food_versions`/`portion_versions`/`scientific_reference_versions`. */
  ARVEN_CATALOG_DB: D1Database;
}

/**
 * Adapts real `ctx.storage.sql` (async-cursor `SqlStorageCursor`) to the
 * synchronous `SyncSqlStorage` shape `DurableObjectV1Transaction` expects.
 * `SqlStorage.exec` itself IS synchronous in the real Durable Objects runtime
 * — the round trip has already happened by the time `exec` returns — only
 * the *cursor's* row access differs from the test double's plain-array
 * shape, which this wrapper resolves eagerly with `.toArray()`.
 *
 * `transactionSync` is intentionally not `sql.transactionSync` — on the real
 * binding it lives on `ctx.storage` itself, so the caller passes both parts
 * in (see `UserDurableObject`'s constructor).
 */
function wrapDurableObjectSql(sql: SqlStorage, transactionSync: <T>(closure: () => T) => T): SyncSqlStorage {
  return {
    exec(query: string, ...bindings: unknown[]) {
      const rows = sql.exec(query, ...bindings).toArray() as Record<string, unknown>[];
      return { toArray: () => rows, one: () => rows[0] };
    },
    transactionSync,
  };
}

/** Reads the shared verified-food catalog from D1 — a separate database instance from this DO's own storage. */
function d1Catalog(db: D1Database): D1LikeQuery {
  return async (query, params) => {
    const result = await db.prepare(query).bind(...params).all<Record<string, unknown>>();
    return result.results;
  };
}

/**
 * One `UserDurableObject` instance == one authenticated user's V1 persistence.
 * Base schema and incremental hardening schemas are applied idempotently inside
 * `blockConcurrencyWhile` on every wake before any request can reach the adapter.
 */
export class UserDurableObject {
  private readonly runner: V1TransactionRunner;

  constructor(private readonly ctx: DurableObjectState, env: UserDurableObjectEnv) {
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(USER_DURABLE_OBJECT_SCHEMA_V1);
      this.ctx.storage.sql.exec(USER_DURABLE_OBJECT_PHASE6_HARDENING);
    });
    const sql = wrapDurableObjectSql(this.ctx.storage.sql, (closure) => this.ctx.storage.transactionSync(closure));
    const tx = new DurableObjectV1Transaction(sql, d1Catalog(env.ARVEN_CATALOG_DB));
    this.runner = new DurableObjectV1TransactionRunner(tx);
  }

  /** Exposes this user's transaction runner for same-isolate callers (tests; a future in-Worker caller). */
  getTransactionRunner(): V1TransactionRunner {
    return this.runner;
  }

  /** No HTTP-level API is defined yet; a request reaching this object today is a misconfiguration. */
  async fetch(): Promise<Response> {
    return new Response("UserDurableObject has no HTTP API yet", { status: 501 });
  }
}
