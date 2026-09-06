/**
 * Faz 9 hardening: lightweight, in-process cost telemetry and request deduplication for the one
 * external paid dependency this app has — the AI provider (`lib/ai/provider.ts`). Deliberately not
 * a persisted metrics pipeline (no such infrastructure exists in this app — see `docs/ROADMAP.md`'s
 * Phase 9 entry, "cost telemetry, caching and request deduplication"); this only needs to survive
 * one process/request lifetime to do its job: catch a runaway loop of identical calls and make the
 * running cost visible during development and in server logs.
 */

export type AiUsageRecord = {
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  recordedAt: string;
};

/**
 * Approximate USD cost per 1,000 tokens. Deliberately conservative placeholder figures, not billed
 * amounts — real provider pricing varies by model/contract and changes independently of this code.
 * Never presented to the end user as an exact bill; server-log/ops visibility only.
 */
const APPROX_USD_PER_1K_PROMPT_TOKENS = 0.00015;
const APPROX_USD_PER_1K_COMPLETION_TOKENS = 0.0006;

const usageLog: AiUsageRecord[] = [];
const MAX_RECORDS = 2000;

export function recordAiUsage(record: Omit<AiUsageRecord, "recordedAt">): void {
  usageLog.push({ ...record, recordedAt: new Date().toISOString() });
  if (usageLog.length > MAX_RECORDS) usageLog.splice(0, usageLog.length - MAX_RECORDS);
}

export type AiUsageSummary = {
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  approxCostUsd: number;
  byEndpoint: Record<string, { callCount: number; promptTokens: number; completionTokens: number }>;
};

/** Aggregates everything recorded so far in this process — resets on redeploy/restart, by design. */
export function getAiUsageSummary(): AiUsageSummary {
  const byEndpoint: AiUsageSummary["byEndpoint"] = {};
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  for (const record of usageLog) {
    totalPromptTokens += record.promptTokens;
    totalCompletionTokens += record.completionTokens;
    const bucket = byEndpoint[record.endpoint] ?? { callCount: 0, promptTokens: 0, completionTokens: 0 };
    bucket.callCount += 1;
    bucket.promptTokens += record.promptTokens;
    bucket.completionTokens += record.completionTokens;
    byEndpoint[record.endpoint] = bucket;
  }
  const approxCostUsd = (totalPromptTokens / 1000) * APPROX_USD_PER_1K_PROMPT_TOKENS + (totalCompletionTokens / 1000) * APPROX_USD_PER_1K_COMPLETION_TOKENS;
  return { callCount: usageLog.length, totalPromptTokens, totalCompletionTokens, approxCostUsd: Math.round(approxCostUsd * 1e6) / 1e6, byEndpoint };
}

/** Test-only reset so usage assertions never leak between test files. */
export function resetAiUsageForTests(): void {
  usageLog.length = 0;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Collapses concurrent identical calls (same `key`) into one shared in-flight promise instead of
 * issuing the same paid network request twice — e.g. a double-tap "gönder" before the first request
 * finishes. Deliberately NOT a result cache: the entry is removed the moment the call settles
 * (success or failure), so it can never serve a stale answer to a later, genuinely new request.
 */
export async function dedupeInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
