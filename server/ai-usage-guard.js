import { createHash } from "node:crypto";
import { clearInterval, setInterval } from "node:timers";

const DEFAULTS = Object.freeze({
  rateLimitPerMinute: 20,
  dailyRequestLimitPerIp: 60,
  maxRequestsPerSession: 20,
  dailySpecLimitPerIp: 3,
  cleanupIntervalMs: 10 * 60 * 1000,
  retentionMs: 2 * 24 * 60 * 60 * 1000,
  maxEntries: 10_000,
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function usageGuardConfig(env = process.env) {
  return {
    enabled: String(env.AI_USAGE_LIMITS_ENABLED ?? "true").toLowerCase() !== "false",
    rateLimitPerMinute: positiveInteger(env.AI_RATE_LIMIT_PER_MINUTE, DEFAULTS.rateLimitPerMinute),
    dailyRequestLimitPerIp: positiveInteger(env.AI_DAILY_REQUEST_LIMIT_PER_IP, DEFAULTS.dailyRequestLimitPerIp),
    maxRequestsPerSession: positiveInteger(env.AI_MAX_REQUESTS_PER_SESSION, DEFAULTS.maxRequestsPerSession),
    dailySpecLimitPerIp: positiveInteger(env.AI_DAILY_SPEC_LIMIT_PER_IP, DEFAULTS.dailySpecLimitPerIp),
    cleanupIntervalMs: positiveInteger(env.AI_USAGE_CLEANUP_INTERVAL_MS, DEFAULTS.cleanupIntervalMs),
    retentionMs: positiveInteger(env.AI_USAGE_RETENTION_MS, DEFAULTS.retentionMs),
    maxEntries: positiveInteger(env.AI_USAGE_MAX_ENTRIES, DEFAULTS.maxEntries),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function requestFingerprint(operation, input) {
  return createHash("sha256").update(`${operation}\n${stableJson(input)}`).digest("hex").slice(0, 20);
}

export class AIUsageLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AIUsageLimitError";
    this.status = 429;
    this.code = code;
  }
}

const minuteWindow = (now) => Math.floor(now / 60_000);
const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

function boundedSet(map, key, value, maxEntries) {
  if (!map.has(key) && map.size >= maxEntries) {
    let oldestKey;
    let oldestSeen = Infinity;
    for (const [candidateKey, candidate] of map) {
      if ((candidate.lastSeen ?? 0) < oldestSeen) {
        oldestKey = candidateKey;
        oldestSeen = candidate.lastSeen ?? 0;
      }
    }
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}

/**
 * Single-process usage store. Its public run/cleanup interface is deliberately
 * storage-neutral so a Redis-backed implementation can replace it later.
 */
export class AIUsageGuard {
  constructor({ config = usageGuardConfig(), now = () => Date.now(), diagnostic = () => {}, scheduleCleanup = true } = {}) {
    this.config = { ...DEFAULTS, ...config };
    this.now = now;
    this.diagnostic = diagnostic;
    this.minuteByIp = new Map();
    this.dailyByIp = new Map();
    this.sessionByIpAndId = new Map();
    this.specSessionsByIp = new Map();
    this.inFlight = new Map();
    this.cleanupTimer = scheduleCleanup ? setInterval(() => this.cleanup(), this.config.cleanupIntervalMs) : null;
    this.cleanupTimer?.unref?.();
  }

  close() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  cleanup() {
    const now = this.now();
    const cutoff = now - this.config.retentionMs;
    const removeOld = (map) => {
      for (const [key, value] of map) if ((value.lastSeen ?? 0) < cutoff) map.delete(key);
    };
    removeOld(this.minuteByIp);
    removeOld(this.dailyByIp);
    removeOld(this.sessionByIpAndId);
    removeOld(this.specSessionsByIp);
    for (const [key, value] of this.inFlight) if ((value.startedAt ?? 0) < now - this.config.cleanupIntervalMs) this.inFlight.delete(key);
  }

  snapshot() {
    return {
      minuteEntries: this.minuteByIp.size,
      dailyEntries: this.dailyByIp.size,
      sessionEntries: this.sessionByIpAndId.size,
      specEntries: this.specSessionsByIp.size,
      inFlightEntries: this.inFlight.size,
    };
  }

  #throwLimit(code, message, metadata) {
    this.diagnostic("ai_usage_limited", { code, operation: metadata.operation, session_id: metadata.sessionId, request_fingerprint: metadata.fingerprint });
    throw new AIUsageLimitError(code, message);
  }

  #consume(metadata) {
    if (!this.config.enabled) return;
    const now = this.now();
    const day = utcDay(now);
    const minute = minuteWindow(now);
    const sessionKey = `${metadata.ip}\u0000${metadata.sessionId}`;
    const minuteState = this.minuteByIp.get(metadata.ip);
    const dailyState = this.dailyByIp.get(metadata.ip);
    const sessionState = this.sessionByIpAndId.get(sessionKey);
    const specState = this.specSessionsByIp.get(metadata.ip);

    if (metadata.operation === "generate-spec") {
      const sessions = specState?.day === day ? specState.sessions : new Set();
      if (!sessions.has(metadata.sessionId) && sessions.size >= this.config.dailySpecLimitPerIp) {
        this.#throwLimit("AI_DAILY_SPEC_LIMIT", "本日のSPEC作成上限に達しました。また明日お試しください。", metadata);
      }
    }
    if (minuteState?.window === minute && minuteState.count >= this.config.rateLimitPerMinute) {
      this.#throwLimit("AI_RATE_LIMIT", "短時間にAI処理が集中しています。少し待ってからもう一度お試しください。", metadata);
    }
    if (dailyState?.day === day && dailyState.count >= this.config.dailyRequestLimitPerIp) {
      this.#throwLimit("AI_DAILY_REQUEST_LIMIT", "本日のAI利用上限に達しました。また明日お試しください。", metadata);
    }
    if (sessionState?.count >= this.config.maxRequestsPerSession) {
      this.#throwLimit("AI_SESSION_REQUEST_LIMIT", "この相談で利用できるAI処理の上限に達しました。新しい相談としてやり直してください。", metadata);
    }

    boundedSet(this.minuteByIp, metadata.ip, { window: minute, count: minuteState?.window === minute ? minuteState.count + 1 : 1, lastSeen: now }, this.config.maxEntries);
    boundedSet(this.dailyByIp, metadata.ip, { day, count: dailyState?.day === day ? dailyState.count + 1 : 1, lastSeen: now }, this.config.maxEntries);
    boundedSet(this.sessionByIpAndId, sessionKey, { count: (sessionState?.count ?? 0) + 1, lastSeen: now }, this.config.maxEntries);
    if (metadata.operation === "generate-spec") {
      const sessions = specState?.day === day ? new Set(specState.sessions) : new Set();
      sessions.add(metadata.sessionId);
      boundedSet(this.specSessionsByIp, metadata.ip, { day, sessions, lastSeen: now }, this.config.maxEntries);
    }
  }

  run({ ip, sessionId, operation, input }, handler) {
    const normalizedIp = String(ip || "unknown");
    const normalizedSessionId = String(sessionId || "anonymous").slice(0, 160);
    const fingerprint = requestFingerprint(operation, input);
    const inFlightKey = `${normalizedIp}\u0000${normalizedSessionId}\u0000${operation}\u0000${fingerprint}`;
    const existing = this.inFlight.get(inFlightKey);
    if (existing) {
      this.diagnostic("ai_request_deduplicated", { operation, session_id: normalizedSessionId, request_fingerprint: fingerprint });
      return existing.promise;
    }

    const metadata = { ip: normalizedIp, sessionId: normalizedSessionId, operation, fingerprint };
    if (this.inFlight.size >= this.config.maxEntries) {
      this.#throwLimit("AI_SERVER_BUSY", "AI処理が混み合っています。少し待ってからもう一度お試しください。", metadata);
    }
    this.#consume(metadata);
    const promise = Promise.resolve().then(() => handler({ sessionId: normalizedSessionId, requestFingerprint: fingerprint }));
    this.inFlight.set(inFlightKey, { promise, startedAt: this.now(), lastSeen: this.now() });
    promise.finally(() => {
      if (this.inFlight.get(inFlightKey)?.promise === promise) this.inFlight.delete(inFlightKey);
    }).catch(() => undefined);
    return promise;
  }
}

