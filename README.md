# @armature-tech/ai-traffic

This package records AI crawler requests on your server or edge. Browser analytics cannot do this because many crawlers do not run page JavaScript.

## Install with an AI agent

Copy this prompt into your coding agent:

```text
Install Armature AI Traffic in this project. Use @armature-tech/ai-traffic and follow https://docs.armature.tech/ai-traffic/agent-install. Complete the code, secret, DNS, deployment, and production test. Ask me only for values or access that you cannot get. Do not expose the write key or add client-side tracking.
```

## Next.js 16 quickstart

Install the package:

```bash
npm install @armature-tech/ai-traffic
```

Save the key that Armature generated:

```bash
ARMATURE_AI_TRAFFIC_API_KEY=ait_us_...
```

Add `proxy.ts` beside your `app` or `pages` directory:

```ts
import { createVercelAiTraffic, trackVercelRequest } from "@armature-tech/ai-traffic/vercel";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const traffic = createVercelAiTraffic();

export function proxy(request: NextRequest, event: NextFetchEvent) {
  void trackVercelRequest(traffic, request, event);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

The matcher keeps `robots.txt`, `llms.txt`, Markdown, and sitemaps visible to the adapter.

The tracking call does not change the page response. `event.waitUntil()` keeps delivery alive after the response.

## Before you deploy

AI Traffic is in private beta. Ask Armature to create the site and write key. Add the DNS TXT record that Armature gives you. Then tell Armature to verify the host. `example.com` and `docs.example.com` are separate hosts. Wildcards are not supported.

Keep the TXT record. The check job runs each hour. A host becomes due 24 hours after its last check. One missing answer does not stop ingestion. Armature needs at least three negative checks and 48 hours before it returns the host to `pending`. A DNS timeout does not change the host state.

A new owner can verify the same host when DNS has the new proof. The valid proof transfers the host at once.

Use a US key with `app.armature.tech`. Use an EU key with `eu.armature.tech`. The package selects the correct endpoint from the key.

Hosted sites such as Mintlify, GitBook, and ReadMe cannot install this package. You need a programmable proxy in front of that site. See [hosted sites](./docs/hosted-sites.md).

## More guides

- [Next.js and Vercel](./docs/vercel-nextjs.md)
- [Cloudflare Workers and Pages](./docs/cloudflare.md)
- [Express, Hono, and generic Fetch](./docs/node-and-fetch.md)
- [Direct HTTPS contract](./docs/direct-api.md)
- [Data and security](./docs/data-and-security.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Public API

`createAiTraffic(config)` returns `track()`, `flush()`, and `pending()`.

`track()` does not throw synchronously. Delivery errors do not reject the customer request. Use `onError` to send SDK errors to your logs.

The queue holds at most 1,000 events. A short window combines concurrent requests into batches of up to 20. It drops the oldest event on overflow.

Use `waitUntil` or `schedule` when the runtime has a background lifecycle. Use `delivery: "await"` or call `flush()` before a serverless Node function ends. Without a scheduler, the package reports one warning and uses a best-effort timer for long-running Node servers.

The package retries network and server failures. It does not retry `429`. Use `onError` to read the server code and retry delay.

Use `captureOtherBots: true` to send every generic bot candidate. The default samples generic bot candidates at 1%. Known AI crawlers are always sent.

This package has no runtime dependencies. It supports Node.js 20 or later, Vercel edge runtimes, and Cloudflare Workers.
