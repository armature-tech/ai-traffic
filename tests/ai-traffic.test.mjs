import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  candidateDecision,
  createAiTraffic,
  GENERIC_BOT_HINTS,
  IGNORED_EXTENSION_PATTERNS,
  KNOWN_AI_CRAWLER_TOKENS,
} from "../dist/esm/index.js";

const require = createRequire(import.meta.url);
const { CRAWLERS, UNKNOWN_CRAWLER_HINTS } = require("../../../lib/crawler-analytics/catalog.js");

const API_KEY = `ait_us_${randomUUID().replaceAll("-", "")}_${"s".repeat(43)}`;

function request(userAgent, url = "https://example.com/docs?token=secret") {
  return new Request(url, { headers: { "user-agent": userAgent, referer: "https://private.example/search?q=secret" } });
}

test("every known AI token passes the local filter", () => {
  for (const token of KNOWN_AI_CRAWLER_TOKENS) {
    assert.equal(candidateDecision({ userAgent: `${token}/1.0`, path: "/docs", method: "GET" }).track, true, token);
  }
});

test("the built SDK, server, and landing prefilters have exact catalog parity", async () => {
  assert.deepEqual([...KNOWN_AI_CRAWLER_TOKENS].sort(), CRAWLERS.map((crawler) => crawler.token).sort());
  assert.deepEqual([...GENERIC_BOT_HINTS].sort(), [...UNKNOWN_CRAWLER_HINTS].sort());
  const landing = await readFile(new URL("../../../apps/landing/middleware.ts", import.meta.url), "utf8");
  assert.match(landing, /@armature-tech\/ai-traffic\/vercel/);
  assert.match(landing, /captureOtherBots:\s*true/);
  assert.doesNotMatch(landing, /LIKELY_CRAWLER|IGNORED_DOCUMENT_EXTENSION/);
});

test("the routing fixture has no known-AI misses and below one percent normal traffic", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/crawler-routing.json", import.meta.url), "utf8"));
  const aiMisses = fixture.knownAi.filter((userAgent) => !candidateDecision({ userAgent, path: "/docs", method: "GET" }).track);
  const normalSent = fixture.normal.filter((userAgent) => candidateDecision({ userAgent, path: "/docs", method: "GET" }).track);
  assert.deepEqual(aiMisses, []);
  assert.ok(normalSent.length / fixture.normal.length < 0.01, JSON.stringify(normalSent));
});

test("browser, API, and asset traffic is ignored", () => {
  const browser = "Mozilla/5.0 Chrome/140.0 Safari/537.36";
  assert.equal(candidateDecision({ userAgent: browser, path: "/docs", method: "GET" }).track, false);
  assert.equal(candidateDecision({ userAgent: "GPTBot", path: "/api/private", method: "GET" }).track, false);
  assert.equal(candidateDecision({ userAgent: "GPTBot", path: "/asset.js", method: "GET" }).track, false);
  assert.equal(candidateDecision({ userAgent: "GPTBot", path: "/llms.txt", method: "GET" }).track, true);
  assert.equal(candidateDecision({ userAgent: "GPTBot", path: "/docs", method: "POST" }).track, false);
});

test("a bearer-authenticated batch has path-only URLs and no referrer", async () => {
  let capturedUrl = "";
  let capturedInit = {};
  const scheduled = [];
  const tracker = createAiTraffic({
    apiKey: API_KEY,
    endpoint: "http://localhost:3000/api/ai-traffic/ingest",
    retryCount: 0,
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init || {};
      return new Response(null, { status: 202 });
    },
  });
  await tracker.track(request("GPTBot/1.0"), { waitUntil: (work) => scheduled.push(work), ip: "192.0.2.10" });
  await Promise.all(scheduled);
  assert.equal(capturedUrl, "http://localhost:3000/api/ai-traffic/ingest");
  const body = String(capturedInit.body);
  const parsed = JSON.parse(body);
  assert.equal(parsed.events[0].path, "/docs");
  assert.equal(parsed.events[0].ip, "192.0.2.10");
  assert.equal(body.includes("token=secret"), false);
  assert.equal(body.includes("private.example"), false);
  const headers = capturedInit.headers;
  assert.equal(headers.authorization, `Bearer ${API_KEY}`);
  assert.equal(headers["x-armature-ai-traffic-signature"], undefined);
});

test("tracking and delivery failures do not reject or throw", async () => {
  const phases = [];
  const invalid = createAiTraffic({ apiKey: "bad", onError: (_error, context) => phases.push(context.phase) });
  assert.doesNotThrow(() => { void invalid.track({ url: "bad" }); });
  const failing = createAiTraffic({
    apiKey: API_KEY,
    endpoint: "http://localhost:3000/ingest",
    delivery: "await",
    retryCount: 0,
    fetch: async () => { throw new Error("offline"); },
    onError: (_error, context) => phases.push(context.phase),
  });
  await assert.doesNotReject(failing.track(request("ClaudeBot")));
  assert.ok(phases.includes("config"));
  assert.ok(phases.includes("delivery"));
});

test("generic bot sampling is deterministic", () => {
  const input = { userAgent: "NewCrawler/1.0", path: "/docs", method: "GET" };
  const first = candidateDecision({ ...input, unknownBotSampleRate: 0.5 });
  const second = candidateDecision({ ...input, unknownBotSampleRate: 0.5 });
  assert.deepEqual(first, second);
  assert.deepEqual(candidateDecision({ ...input, captureOtherBots: true }), { track: true, reason: "other_bot" });
  const sampled = Array.from({ length: 10_000 }, (_, index) => candidateDecision({
    ...input,
    sampleKey: createHash("sha256").update(String(index)).digest("hex"),
    unknownBotSampleRate: 0.01,
  })).filter((decision) => decision.track).length;
  assert.ok(sampled >= 70 && sampled <= 130, `sampled ${sampled} of 10000 events`);
});

test("the default batch window combines concurrent events", async () => {
  const batches = [];
  const scheduled = [];
  const tracker = createAiTraffic({
    apiKey: API_KEY,
    endpoint: "http://localhost:3000/ingest",
    batchWindowMs: 10,
    retryCount: 0,
    fetch: async (_url, init) => {
      batches.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 202 });
    },
  });
  for (let index = 0; index < 20; index += 1) {
    void tracker.track(request("GPTBot/1.0", `https://example.com/docs/${index}`), {
      waitUntil: (work) => scheduled.push(work),
    });
  }
  await Promise.all(scheduled);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].events.length, 20);
});

test("missing background scheduling reports once and still flushes in Node", async () => {
  const phases = [];
  let delivered = 0;
  const tracker = createAiTraffic({
    apiKey: API_KEY,
    endpoint: "http://localhost:3000/ingest",
    batchWindowMs: 1,
    retryCount: 0,
    fetch: async () => {
      delivered += 1;
      return new Response(null, { status: 202 });
    },
    onError: (_error, context) => phases.push(context.phase),
  });
  await tracker.track(request("GPTBot/1.0"));
  await tracker.track(request("GPTBot/1.0", "https://example.com/two"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(phases.filter((phase) => phase === "schedule").length, 1);
  assert.equal(delivered, 1);
});

test("429 responses are not retried and expose retry timing", async () => {
  let calls = 0;
  const errors = [];
  const tracker = createAiTraffic({
    apiKey: API_KEY,
    endpoint: "http://localhost:3000/ingest",
    delivery: "await",
    retryCount: 2,
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: "ai_traffic_rate_limited", details: { retryAfterSec: 60 } } }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      });
    },
    onError: (error) => errors.push(error),
  });
  await tracker.track(request("GPTBot/1.0"));
  assert.equal(calls, 1);
  assert.equal(errors[0].status, 429);
  assert.equal(errors[0].retryAfterSec, 60);
});

test("configuration errors are reported once", async () => {
  const phases = [];
  const tracker = createAiTraffic({ apiKey: "bad", onError: (_error, context) => phases.push(context.phase) });
  await tracker.track(request("GPTBot/1.0"));
  await tracker.track(request("GPTBot/1.0"));
  assert.deepEqual(phases, ["config"]);
});

test("the bounded queue drops oldest events and sends a batch of 20", async () => {
  const dropped = [];
  const batches = [];
  const tracker = createAiTraffic({
    apiKey: API_KEY,
    endpoint: "http://localhost:3000/ingest",
    queueCapacity: 20,
    batchSize: 20,
    retryCount: 0,
    fetch: async (_url, init) => {
      batches.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 202 });
    },
    onError: (_error, context) => {
      if (context.phase === "queue") dropped.push(context.droppedEvents);
    },
  });
  for (let index = 0; index < 30; index += 1) {
    await tracker.track(request("GPTBot/1.0", `https://example.com/docs/${index}`));
  }
  assert.equal(tracker.pending(), 20);
  assert.equal(dropped.reduce((sum, value) => sum + value, 0), 10);
  await tracker.flush();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].events.length, 20);
  assert.equal(batches[0].events[0].path, "/docs/10");
});

test("normal browser tracking overhead stays below the one millisecond median budget", async () => {
  const tracker = createAiTraffic({ apiKey: API_KEY, endpoint: "http://localhost:3000/ingest", fetch: async () => new Response() });
  const durations = [];
  for (let index = 0; index < 10_000; index += 1) {
    const start = performance.now();
    await tracker.track(request("Mozilla/5.0 Chrome/140 Safari/537.36", `https://example.com/docs/${index}`));
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  assert.ok(durations[5_000] < 1, `median was ${durations[5_000]}ms`);
});
