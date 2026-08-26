import { candidateDecision } from "./catalog.js";
import { AiTrafficHttpError } from "./types.js";
import type {
  AiTrafficBatch,
  AiTrafficConfig,
  AiTrafficEvent,
  AiTrafficTracker,
  RequestLike,
  TrackRequestOptions,
} from "./types.js";

const SDK_VERSION = "0.0.0-development";
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_QUEUE_CAPACITY = 1_000;
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_BATCH_WINDOW_MS = 20;
const DEFAULT_ENDPOINTS = {
  us: "https://app.armature.tech/api/ai-traffic/ingest",
  eu: "https://eu.armature.tech/api/ai-traffic/ingest",
} as const;
const KEY_RE = /^ait_(us|eu)_([0-9a-f]{32})_([A-Za-z0-9_-]{32,})$/i;

type ValidConfig = {
  apiKey: string;
  endpoint: string;
  fetchImpl: typeof globalThis.fetch;
  delivery: "background" | "await";
  schedule?: (work: Promise<void>) => void;
  timeoutMs: number;
  retryCount: number;
  batchSize: number;
  batchWindowMs: number;
  queueCapacity: number;
  captureOtherBots: boolean;
  unknownBotSampleRate: number;
  source: string;
};

function report(config: AiTrafficConfig, error: unknown, phase: "config" | "queue" | "delivery" | "schedule", droppedEvents?: number) {
  try {
    config.onError?.(error, { phase, ...(droppedEvents ? { droppedEvents } : {}) });
  } catch {
    // Customer error hooks must not affect their request.
  }
}

function readApiKey(config: AiTrafficConfig): string {
  if (config.apiKey) return String(config.apiKey).trim();
  if (typeof process !== "undefined") return String(process.env.ARMATURE_AI_TRAFFIC_API_KEY || "").trim();
  return "";
}

function validateConfig(config: AiTrafficConfig): ValidConfig {
  const apiKey = readApiKey(config);
  const match = apiKey.match(KEY_RE);
  if (!match) throw new Error("A valid ARMATURE_AI_TRAFFIC_API_KEY is required");
  const region = match[1]!.toLowerCase() as "us" | "eu";
  const endpoint = String(config.endpoint || DEFAULT_ENDPOINTS[region]);
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== "https:" && parsedEndpoint.hostname !== "localhost" && parsedEndpoint.hostname !== "127.0.0.1") {
    throw new Error("The AI Traffic endpoint must use HTTPS");
  }
  const knownRegion = parsedEndpoint.hostname === "eu.armature.tech" ? "eu"
    : parsedEndpoint.hostname === "app.armature.tech" ? "us" : null;
  if (knownRegion && knownRegion !== region) throw new Error("The API key and endpoint regions do not match");
  const fetchImpl = config.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("A Fetch API implementation is required");
  return {
    apiKey,
    endpoint: parsedEndpoint.toString(),
    fetchImpl,
    delivery: config.delivery === "await" ? "await" : "background",
    schedule: config.schedule,
    timeoutMs: Math.max(100, Math.min(10_000, config.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    retryCount: Math.max(0, Math.min(2, config.retryCount ?? 1)),
    batchSize: Math.max(1, Math.min(20, config.batchSize ?? DEFAULT_BATCH_SIZE)),
    batchWindowMs: Math.max(0, Math.min(1_000, config.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS)),
    queueCapacity: Math.max(20, Math.min(10_000, config.queueCapacity ?? DEFAULT_QUEUE_CAPACITY)),
    captureOtherBots: config.captureOtherBots === true,
    unknownBotSampleRate: Math.max(0, Math.min(1, config.unknownBotSampleRate ?? 0.01)),
    source: String(config.source || "generic_fetch").slice(0, 64),
  };
}

function headerValue(headers: RequestLike["headers"], name: string): string {
  if (!headers) return "";
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) || "";
  const record = headers as Record<string, string | string[] | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  const value = direct ?? Object.entries(record).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function safeUuid(): string {
  return globalThis.crypto.randomUUID();
}

function buildEvent(request: RequestLike, config: ValidConfig, options: TrackRequestOptions): AiTrafficEvent | null {
  const url = new URL(String(request.url || ""));
  const method = String(request.method || "GET").toUpperCase();
  const userAgent = headerValue(request.headers, "user-agent").trim().slice(0, 2048);
  const eventId = safeUuid();
  const decision = candidateDecision({
    userAgent,
    path: url.pathname,
    method,
    captureOtherBots: config.captureOtherBots,
    unknownBotSampleRate: config.unknownBotSampleRate,
    sampleKey: eventId,
  });
  if (!decision.track) return null;
  const statusCode = options.statusCode == null ? null : Number(options.statusCode);
  return {
    eventId,
    observedAt: new Date().toISOString(),
    source: String(options.source || config.source).slice(0, 64),
    hostname: url.hostname.toLowerCase(),
    path: url.pathname.slice(0, 2048) || "/",
    method: method as "GET" | "HEAD",
    ...(Number.isInteger(statusCode) && statusCode! >= 100 && statusCode! <= 599 ? { statusCode: statusCode! } : {}),
    userAgent,
    ...(options.ip ? { ip: String(options.ip).slice(0, 64) } : {}),
    ...(decision.sampleRate ? { sampleRate: decision.sampleRate } : {}),
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function deliver(config: ValidConfig, events: AiTrafficEvent[]): Promise<void> {
  const batch: AiTrafficBatch = {
    schemaVersion: 1,
    sdk: { name: "@armature-tech/ai-traffic", version: SDK_VERSION },
    events,
  };
  const rawBody = JSON.stringify(batch);
  let lastError: unknown = new Error("AI Traffic delivery failed");
  for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await config.fetchImpl(config.endpoint, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: rawBody,
        signal: controller.signal,
      });
      if (response.ok) return;
      let details: { error?: { code?: string; details?: { retryAfterSec?: number } }; retryAfterSec?: number } = {};
      try {
        details = await response.json() as typeof details;
      } catch {
        // Error bodies are optional.
      }
      const retryAfterHeader = response.headers.get("retry-after");
      const headerDelay = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
      const detailDelay = details.error?.details?.retryAfterSec ?? details.retryAfterSec;
      const retryAfterSec = Number.isFinite(headerDelay) && headerDelay >= 0
        ? headerDelay
        : detailDelay === undefined ? Number.NaN : Number(detailDelay);
      lastError = new AiTrafficHttpError(`AI Traffic ingest returned HTTP ${response.status}`, {
        status: response.status,
        code: details.error?.code,
        ...(Number.isFinite(retryAfterSec) && retryAfterSec >= 0 ? { retryAfterSec } : {}),
      });
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < config.retryCount) await wait(50 * (attempt + 1));
  }
  throw lastError;
}

export function createAiTraffic(input: AiTrafficConfig = {}): AiTrafficTracker {
  let config: ValidConfig | null = null;
  try {
    config = validateConfig(input);
  } catch (error) {
    report(input, error, "config");
  }

  const pending: AiTrafficEvent[] = [];
  let running: Promise<void> | null = null;
  let scheduled: Promise<void> | null = null;
  let missingSchedulerReported = false;

  const drain = async () => {
    if (!config) return;
    while (pending.length > 0) {
      const events = pending.splice(0, config.batchSize);
      try {
        await deliver(config, events);
      } catch (error) {
        report(input, error, "delivery");
      }
    }
  };

  const flush = async () => {
    if (!config) return;
    while (running || pending.length > 0) {
      if (!running) {
        const task = Promise.resolve()
          .then(drain)
          .finally(() => {
            if (running === task) running = null;
          });
        running = task;
      }
      await running;
    }
  };

  const schedule = (waitUntil?: (work: Promise<void>) => void) => {
    const scheduler = waitUntil || config?.schedule;
    if (!scheduled) {
      const delay = config?.delivery === "await" ? 0 : config?.batchWindowMs || 0;
      const task = Promise.resolve()
        .then(() => delay > 0 ? wait(delay) : undefined)
        .then(flush)
        .finally(() => {
          if (scheduled === task) scheduled = null;
        });
      scheduled = task;
    }
    const work = scheduled;
    if (scheduler && work) {
      try {
        scheduler(work);
      } catch (error) {
        report(input, error, "schedule");
      }
      return work;
    }
    if (config?.delivery === "await") return work || flush();
    if (!missingSchedulerReported) {
      missingSchedulerReported = true;
      report(input, new Error("AI Traffic has no background scheduler. Delivery is best-effort; pass waitUntil, configure schedule, or use delivery: await."), "schedule");
    }
    // This works in persistent Node.js processes. A serverless runtime can stop
    // it after the response, which is why the one-time warning is required.
    void work;
    return Promise.resolve();
  };

  const track = (request: RequestLike, options: TrackRequestOptions = {}): Promise<void> => {
    try {
      if (!config) {
        return Promise.resolve();
      }
      const event = buildEvent(request, config, options);
      if (!event) return Promise.resolve();
      let dropped = 0;
      while (pending.length >= config.queueCapacity) {
        pending.shift();
        dropped += 1;
      }
      if (dropped > 0) report(input, new Error("AI Traffic queue capacity was reached"), "queue", dropped);
      pending.push(event);
      const work = schedule(options.waitUntil);
      if (config.delivery === "await") return work;
      return Promise.resolve();
    } catch (error) {
      report(input, error, "queue");
      return Promise.resolve();
    }
  };

  return { track, flush, pending: () => pending.length };
}
