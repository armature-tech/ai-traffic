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
