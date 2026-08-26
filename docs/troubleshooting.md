# Troubleshooting

## The site is empty

Confirm that the exact host is added to the Armature site. Confirm that the deployed key belongs to the same region and site. Then request a normal page with a known crawler user agent in a controlled test.

No traffic can also mean that no crawler visited the site yet.

## The domain returned to pending

A pending domain still sends private analytics. Restore the Armature TXT record only if you need the verified ownership state.

## The adapter does not run

Check the proxy or middleware file location. Check the route matcher. Keep `robots.txt`, `llms.txt`, Markdown, and sitemaps in the matcher.

## Delivery stops after the response

Vercel and Cloudflare need `waitUntil()`. A serverless Node.js handler must await the bounded delivery mode before it ends. A long-running Express process can flush after the response. The SDK reports a missing background scheduler once through `onError`.

## IP checks fail

Use only the IP field set by your host. The Vercel and Cloudflare adapters know their platform field. Express needs correct `trust proxy` settings or an explicit resolver. Hono and generic adapters need `ipHeader` or `getIp`.

`range_mismatch` does not prove that the bot is fake. It can also mean that a proxy supplied the wrong source IP.

## Requests fail

Allow outbound HTTPS to the regional Armature host. Check SDK errors through `onError`. A wrong region returns `401`. A noisy site or used quota returns `429`. The SDK does not retry `429`.

Tracking failures never change the customer page response.
