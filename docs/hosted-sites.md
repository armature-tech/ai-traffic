# Hosted and static sites

This npm package needs a server, edge function, or programmable proxy that sees the HTTP request.

You cannot install it inside a hosted Mintlify, GitBook, or ReadMe project. You also cannot install it in static HTML alone. Browser JavaScript does not see crawlers that skip JavaScript.

Version one supports these sites only when you control a proxy in front of them. Put the adapter in that proxy. Keep the original host as the public host. Forward the request to the hosted origin.

Vercel Log Drains and Cloudflare Logpush are future adapters. They are not required for programmable sites. They are also not available in this package today.
