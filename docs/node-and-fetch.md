# Express, Hono, and generic Fetch

## Express

```ts
import express from "express";
import { aiTrafficMiddleware } from "@armature-tech/ai-traffic/express";

const app = express();
app.set("trust proxy", 1); // Use the exact proxy count for your deployment.
app.use(aiTrafficMiddleware());
```

This mode is for a long-running Node.js server. The middleware starts delivery after the response finishes.

Express uses `req.ip`. Configure `trust proxy` only for proxies that you control. You can instead pass `ipHeader` or `getIp(req)` to the adapter.

For a serverless Node.js function, create the core tracker with `delivery: "await"`. Await `track()` before the function ends. This can add up to the configured timeout. A bare, unawaited fetch is not safe in a serverless function.

## Hono

```ts
import { Hono } from "hono";
import { createHonoAiTraffic, trackHonoRequest } from "@armature-tech/ai-traffic/hono";

const app = new Hono();
const traffic = createHonoAiTraffic({ ipHeader: "x-platform-client-ip" });

app.use("*", async (context, next) => {
  void trackHonoRequest(traffic, context);
  await next();
});
```

The helper uses `executionCtx.waitUntil()` when Hono exposes it. Set `ipHeader` to a header that your host controls. You can instead pass `getIp(context)`. The adapter does not assume that Hono runs on Cloudflare.

If the Hono runtime has no execution context, set `delivery: "await"` and await `trackHonoRequest()`, or call `flush()` from a safe server lifecycle hook.

## Generic Fetch handler

```ts
import { createAiTraffic } from "@armature-tech/ai-traffic";

const traffic = createAiTraffic({ source: "my_edge" });

export function handle(request: Request, waitUntil: (work: Promise<void>) => void) {
  void traffic.track(request, {
    waitUntil,
    ip: getPlatformControlledIp(request),
  });
  return servePage(request);
}
```

The generic adapter does not guess which forwarded IP header is safe. Pass an IP only when your platform controls its source.

The default 20 ms window combines concurrent requests. Set `batchWindowMs` only when your server lifecycle supports the chosen delay.
