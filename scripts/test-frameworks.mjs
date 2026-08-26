import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Hono } from "hono";
import { aiTrafficMiddleware } from "../dist/esm/express.js";
import { createHonoAiTraffic, trackHonoRequest } from "../dist/esm/hono.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "tests/fixtures/nextjs-app");
const apiKey = `ait_us_${"1".repeat(32)}_${"s".repeat(43)}`;

function nextBin() {
  return fileURLToPath(import.meta.resolve("next/dist/bin/next"));
}

async function freePort() {
  const server = createNetServer();
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitFor(url, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Next.js fixture did not start");
}

async function testNext() {
  const env = { ...process.env, ARMATURE_AI_TRAFFIC_API_KEY: apiKey, NEXT_TELEMETRY_DISABLED: "1" };
  try {
    execFileSync(process.execPath, [nextBin(), "build", fixture], { cwd: root, env, stdio: "inherit" });
    const port = await freePort();
    const child = spawn(process.execPath, [nextBin(), "start", fixture, "-H", "127.0.0.1", "-p", String(port)], {
      cwd: root,
      env,
      stdio: "pipe",
    });
    try {
      const response = await waitFor(`http://127.0.0.1:${port}/`, child);
      assert.match(await response.text(), /AI Traffic fixture/);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((resolveExit) => child.once("exit", resolveExit));
      }
    }
  } finally {
    await rm(resolve(fixture, ".next"), { recursive: true, force: true });
    await rm(resolve(fixture, "next-env.d.ts"), { force: true });
    await rm(resolve(fixture, "tsconfig.json"), { force: true });
  }
}

async function testExpress() {
  const batches = [];
  const middleware = aiTrafficMiddleware({
    apiKey,
    endpoint: "http://localhost:3000/ingest",
    batchWindowMs: 20,
    retryCount: 0,
    fetch: async (_url, init) => {
      batches.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 202 });
    },
  });
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(middleware);
  app.get("/docs", (_req, res) => res.status(204).end());
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolveListen) => server.once("listening", resolveListen));
  try {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const responses = await Promise.all(["one", "two"].map((suffix) => fetch(`http://127.0.0.1:${port}/docs?request=${suffix}`, {
      headers: { "user-agent": "GPTBot/1.0", "x-forwarded-for": "192.0.2.10" },
    })));
    assert.ok(responses.every((response) => response.status === 204));
    for (let attempt = 0; batches.length === 0 && attempt < 50; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    assert.equal(batches.length, 1);
    assert.equal(batches[0].events.length, 2);
    assert.ok(batches[0].events.every((event) => event.statusCode === 204));
    assert.ok(batches[0].events.every((event) => event.ip === "192.0.2.10"));
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function testHono() {
  const batches = [];
  const traffic = createHonoAiTraffic({
    apiKey,
    endpoint: "http://localhost:3000/ingest",
    delivery: "await",
    ipHeader: "x-runtime-ip",
    retryCount: 0,
    fetch: async (_url, init) => {
      batches.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 202 });
    },
  });
  const app = new Hono();
  app.use("*", async (context, next) => {
    await trackHonoRequest(traffic, context);
    await next();
  });
  app.get("/docs", (context) => context.text("ok"));
  const response = await app.request("https://example.com/docs", {
    headers: { "user-agent": "GPTBot/1.0", "x-runtime-ip": "192.0.2.11" },
  });
  assert.equal(response.status, 200);
  assert.equal(batches[0].events[0].ip, "192.0.2.11");
}

await testExpress();
await testHono();
await testNext();
