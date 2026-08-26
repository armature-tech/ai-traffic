# Direct HTTPS contract

Use this contract for a non-JavaScript server or reverse proxy.

Send `POST /api/ai-traffic/ingest` to the regional Armature host. The body is JSON:

```json
{
  "schemaVersion": 1,
  "sdk": { "name": "my-adapter", "version": "1.0.0" },
  "events": [
    {
      "eventId": "18f1119e-5b54-4da8-9ab3-a264a15b16d9",
      "observedAt": "2026-08-26T12:00:00.000Z",
      "source": "nginx",
      "hostname": "docs.example.com",
      "path": "/guide",
      "method": "GET",
      "statusCode": 200,
      "userAgent": "GPTBot/1.2",
      "ip": "192.0.2.10"
    }
  ]
}
```

The batch can contain 1 to 20 events. The UTF-8 body must be at most 128 KiB.

Set these headers:

```text
Authorization: Bearer ait_us_...
Content-Type: application/json
```

Send the request over HTTPS. Do not add the key to the body or URL.

Only `GET` and `HEAD` events are valid. Send a path without a query string. The observation time can be at most 24 hours from ingest time.

The API returns accepted, duplicate, ignored, and rejected counts. Retry network and `5xx` failures with a strict bound. Reuse each event UUID during a retry.

Do not retry `429` at once. Read `Retry-After` and the response code. A monthly-limit response needs a plan or quota change.
