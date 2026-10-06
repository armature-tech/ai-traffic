# Next.js and Vercel

## Next.js 16 Proxy

Use the quickstart in the package README. Next.js 16 uses `proxy.ts` and a named `proxy` export. Its `NextFetchEvent` has `waitUntil()`.

## Next.js 15 Middleware

Create `middleware.ts`:

```ts
import { createVercelAiTraffic, trackVercelRequest } from "@armature-tech/ai-traffic/vercel";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const traffic = createVercelAiTraffic();

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  void trackVercelRequest(traffic, request, event);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

## Vercel Routing Middleware without Next.js

Create a root `middleware.ts`. Pass the Vercel request context to the helper:

```ts
import { createVercelAiTraffic, trackVercelRequest } from "@armature-tech/ai-traffic/vercel";

const traffic = createVercelAiTraffic();

export default function middleware(request: Request, context: { waitUntil(work: Promise<void>): void }) {
  void trackVercelRequest(traffic, request, context);
  return new Response("Continue with your existing middleware response.");
}
```

Merge the tracking call into an existing proxy or middleware. A Next.js project supports only one such file.

The Vercel adapter reads the platform-set IP header. Do not copy arbitrary browser headers into that field.

## Coverage and response status

Routing middleware sees the incoming request before Vercel serves the final response.
It cannot report the final HTTP status of a rewritten, cached, or downstream page.
Leave `statusCode` unset when that status is unknown. A middleware continuation
response with status 200 does not establish that the requested page returned 200.
Use Vercel request logs or Observability when you need final response status.

Requests that do not reach the middleware cannot be recorded by this adapter.
Check the middleware matcher and include the routes that serve your website and docs.

## Update crawler coverage

Update the dependency and redeploy to receive changes to the local crawler catalog:

```sh
npm install @armature-tech/ai-traffic@latest
```

Known crawlers are recorded without sampling. The catalog includes ShapBot,
Amazon Kendra (`amazon-kendra`), and Amazon Q Business (`amazon-QBusiness`).
Kendra and Q Business crawl pages for search indexes, so both use the search category.
See the AWS documentation for [Kendra](https://docs.aws.amazon.com/kendra/latest/dg/stop-web-crawler.html)
and [Q Business](https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/stop-web-crawler.html).

Other user agents with bot hints are sampled at 1% by default. Set
`captureOtherBots: true` when you need every request from these other bots.
This also captures non-AI bots. A plain browser or curl user agent does not identify
an AI agent, so it is not captured solely on that basis.
