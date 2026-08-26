# Data and security

## Collected fields

Armature receives the event UUID, time, exact host, path, method, optional status, full user agent, adapter identity, and optional source IP.

The package removes the query string. It does not collect the referrer, cookies, authorization headers, request body, or environment values.

The raw IP is used during crawler-range verification. It is then discarded. Armature can store a keyed IP hash for abuse analysis. That hash includes the site ID. It cannot match one IP across customer sites.

## Credentials

Armature shows a new key once. Store it as `ARMATURE_AI_TRAFFIC_API_KEY` in your host secret store. Armature stores only a scrypt hash.

For rotation, create a second key. Deploy it. Confirm new traffic. Then revoke the old key. Several keys can be active during this overlap.

The HTTPS request uses the key as a bearer credential. The event UUID makes retries safe. A second HMAC made with the same transmitted key would not add security.

Armature applies source-IP and key-ID limits before the scrypt key check. It also applies per-site request, event, and monthly limits after authentication.

## Domain proof

A configured host can send private analytics without DNS verification. An optional DNS TXT record proves control of the host. It supports a verified ownership state and domain transfer. It does not change DNS routing or page speed.

## Verification states

- `verified`: The IP matches a current official range.
- `ua_only`: The vendor has no configured official range source.
- `range_mismatch`: The IP did not match the loaded range. This does not prove spoofing.
- `range_unavailable`: The official range data is missing or old.
- `ip_unavailable`: The adapter did not provide an IP.
- `unknown`: The user agent is a bot candidate with no known label.

Current official range sources cover OpenAI, Perplexity, and Google. Other providers use user-agent-only labels.

## Regions and retention

The site and key belong to one data plane. US data goes to `app.armature.tech`. EU data goes to `eu.armature.tech`.

Each site has a server-assigned retention period and monthly accepted-event limit. Version one keeps raw events for 30 days by default. A job removes expired rows in bounded batches every 15 minutes. Usage counters remain for billing and support.

Deleting a site revokes its keys and releases its domains. It keeps event history until normal retention removes it. Armature records the deletion in the audit log.
