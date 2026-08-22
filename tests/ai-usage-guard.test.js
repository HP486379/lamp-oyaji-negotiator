import test from "node:test";
import assert from "node:assert/strict";
import { AIUsageGuard, requestFingerprint, usageGuardConfig } from "../server/ai-usage-guard.js";
import { usageDiagnostic } from "../server/ai.js";

function createGuard(overrides = {}) {
  let now = Date.UTC(2026, 7, 22, 0, 0, 0);
  const events = [];
  const guard = new AIUsageGuard({
    config: {
      enabled: true,
      rateLimitPerMinute: 100,
      dailyRequestLimitPerIp: 100,
      globalDailyRequestLimit: 100,
      maxRequestsPerSession: 100,
      dailySpecLimitPerIp: 100,
      cleanupIntervalMs: 60_000,
      retentionMs: 120_000,
      maxEntries: 100,
      ...overrides,
    },
    now: () => now,
    diagnostic: (event, metadata) => events.push({ event, metadata }),
    scheduleCleanup: false,
  });
  return { guard, events, setNow: (value) => { now = value; }, advance: (milliseconds) => { now += milliseconds; } };
}

const invoke = (guard, { ip = "203.0.113.10", sessionId = "session-a", operation = "analyze", input = { value: "safe" } } = {}, handler = async () => ({ ok: true })) =>
  guard.run({ ip, sessionId, operation, input }, handler);

test("safe defaults are enabled and development can explicitly disable limits", () => {
  assert.deepEqual(usageGuardConfig({}), {
    enabled: true,
    rateLimitPerMinute: 20,
    dailyRequestLimitPerIp: 60,
    globalDailyRequestLimit: 1000,
    maxRequestsPerSession: 20,
    dailySpecLimitPerIp: 3,
    cleanupIntervalMs: 600_000,
    retentionMs: 172_800_000,
    maxEntries: 10_000,
  });
  assert.equal(usageGuardConfig({ AI_USAGE_LIMITS_ENABLED: "false" }).enabled, false);
});

test("ordinary use remains below every limit", async () => {
  const { guard } = createGuard();
  assert.deepEqual(await invoke(guard), { ok: true });
  assert.deepEqual(guard.snapshot(), { minuteEntries: 1, dailyEntries: 1, globalDailyEntries: 1, sessionEntries: 1, specEntries: 1, inFlightEntries: 0 });
});

test("minute limit rejects before another handler starts", async () => {
  const { guard } = createGuard({ rateLimitPerMinute: 2 });
  let calls = 0;
  const handler = async () => { calls += 1; };
  await invoke(guard, { input: { n: 1 } }, handler);
  await invoke(guard, { input: { n: 2 } }, handler);
  assert.throws(() => invoke(guard, { input: { n: 3 } }, handler), (error) => error.status === 429 && error.code === "AI_RATE_LIMIT");
  assert.equal(calls, 2);
});

test("daily IP limit rejects and resets on a new UTC day", async () => {
  const { guard, advance } = createGuard({ dailyRequestLimitPerIp: 2 });
  await invoke(guard, { input: { n: 1 } });
  await invoke(guard, { input: { n: 2 } });
  assert.throws(() => invoke(guard, { input: { n: 3 } }), (error) => error.code === "AI_DAILY_REQUEST_LIMIT");
  advance(24 * 60 * 60 * 1000);
  await invoke(guard, { input: { n: 4 } });
});

test("session limit stops a runaway session", async () => {
  const { guard } = createGuard({ maxRequestsPerSession: 2 });
  await invoke(guard, { input: { n: 1 } });
  await invoke(guard, { input: { n: 2 } });
  assert.throws(() => invoke(guard, { input: { n: 3 } }), (error) => error.code === "AI_SESSION_REQUEST_LIMIT");
});

test("fourth distinct SPEC session is rejected before analyze calls OpenAI", async () => {
  const { guard } = createGuard({ dailySpecLimitPerIp: 3 });
  let calls = 0;
  const handler = async () => { calls += 1; };
  for (const sessionId of ["spec-1", "spec-2", "spec-3"]) await invoke(guard, { sessionId, operation: "analyze", input: { sessionId } }, handler);
  assert.throws(() => invoke(guard, { sessionId: "spec-4", operation: "analyze", input: { sessionId: "spec-4" } }, handler), (error) => error.code === "AI_DAILY_SPEC_LIMIT");
  assert.equal(calls, 3);
});

test("retrying analyze for the same session is counted as one SPEC session", async () => {
  const { guard } = createGuard({ dailySpecLimitPerIp: 1 });
  await invoke(guard, { sessionId: "spec-1", operation: "analyze", input: { retry: 0 } });
  await invoke(guard, { sessionId: "spec-1", operation: "analyze", input: { retry: 1 } });
  await invoke(guard, { sessionId: "spec-1", operation: "generate-spec", input: { repair: 0 } });
  assert.throws(() => invoke(guard, { sessionId: "spec-2", operation: "analyze", input: { retry: 0 } }), (error) => error.code === "AI_DAILY_SPEC_LIMIT");
});

test("global daily limit aggregates all IPs and resets on a new UTC day", async () => {
  const { guard, advance } = createGuard({ globalDailyRequestLimit: 2 });
  let calls = 0;
  const handler = async () => { calls += 1; };
  await invoke(guard, { ip: "203.0.113.1", operation: "dimensions", input: { n: 1 } }, handler);
  await invoke(guard, { ip: "203.0.113.2", operation: "infer-mvp", input: { n: 2 } }, handler);
  assert.throws(() => invoke(guard, { ip: "203.0.113.3", operation: "validate", input: { n: 3 } }, handler), (error) => error.status === 429 && error.code === "AI_GLOBAL_DAILY_REQUEST_LIMIT" && /AIサービス全体/.test(error.message));
  assert.equal(calls, 2);
  advance(24 * 60 * 60 * 1000);
  await invoke(guard, { ip: "203.0.113.3", operation: "validate", input: { n: 4 } }, handler);
  assert.equal(calls, 3);
});

test("identical in-flight requests share one OpenAI operation", async () => {
  const { guard, events } = createGuard();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const handler = async () => { calls += 1; await pending; return { calls }; };
  const first = invoke(guard, {}, handler);
  const second = invoke(guard, {}, handler);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [{ calls: 1 }, { calls: 1 }]);
  assert.equal(events.filter(({ event }) => event === "ai_request_deduplicated").length, 1);
});

test("cleanup removes expired map entries", async () => {
  const { guard, advance } = createGuard({ retentionMs: 1_000 });
  await invoke(guard, { operation: "analyze" });
  advance(1_001);
  guard.cleanup();
  assert.deepEqual(guard.snapshot(), { minuteEntries: 0, dailyEntries: 0, globalDailyEntries: 0, sessionEntries: 0, specEntries: 0, inFlightEntries: 0 });
});

test("in-flight request tracking is bounded", async () => {
  const { guard } = createGuard({ maxEntries: 1 });
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const first = invoke(guard, { sessionId: "one", input: { n: 1 } }, () => pending);
  await Promise.resolve();
  assert.throws(() => invoke(guard, { sessionId: "two", input: { n: 2 } }), (error) => error.code === "AI_SERVER_BUSY");
  release({ ok: true });
  await first;
});

test("fingerprints are stable without exposing the input", () => {
  const input = { secretText: "private user prompt", nested: { b: 2, a: 1 } };
  assert.equal(requestFingerprint("analyze", input), requestFingerprint("analyze", { nested: { a: 1, b: 2 }, secretText: "private user prompt" }));
  assert.doesNotMatch(requestFingerprint("analyze", input), /private|prompt/);
});

test("usage diagnostics contain token counts but no key or prompt body", () => {
  const data = usageDiagnostic({ model: "gpt-5-mini", usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } }, "analyze", { sessionId: "session-safe", requestFingerprint: "abc123" });
  assert.deepEqual(data, { model: "gpt-5-mini", phase: "analyze", input_tokens: 11, output_tokens: 7, total_tokens: 18, session_id: "session-safe", request_fingerprint: "abc123" });
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /OPENAI_API_KEY|Authorization|private user prompt|sk-/);
});

