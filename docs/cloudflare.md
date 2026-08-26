# Cloudflare Workers and Pages

## Worker

```ts
import { createCloudflareAiTraffic, trackCloudflareRequest } from "@armature-tech/ai-traffic/cloudflare";

export default {
  async fetch(request: Request, env: { ARMATURE_AI_TRAFFIC_API_KEY: string }, ctx: ExecutionContext) {
    const traffic = createCloudflareAiTraffic({ apiKey: env.ARMATURE_AI_TRAFFIC_API_KEY });
    void trackCloudflareRequest(traffic, request, ctx);
    return fetch(request);
  },
};
```

The adapter reads `CF-Connecting-IP`. Cloudflare sets this header. `ctx.waitUntil()` keeps delivery alive after the response.

## Pages Function

Use the same tracker in a Pages `onRequest` function. Pass `context.request` and `context.waitUntil`:

```ts
export const onRequest = async (context) => {
  const traffic = createCloudflareAiTraffic({ apiKey: context.env.ARMATURE_AI_TRAFFIC_API_KEY });
  void traffic.track(context.request, {
    ip: context.request.headers.get("cf-connecting-ip"),
    waitUntil: context.waitUntil.bind(context),
    source: "cloudflare_pages",
  });
  return context.next();
};
```

Add the key as an encrypted Worker or Pages secret. Do not store it in source control.
