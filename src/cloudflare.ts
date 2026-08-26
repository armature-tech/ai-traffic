import { createAiTraffic } from "./core.js";
import type { AiTrafficConfig, AiTrafficTracker, RequestLike } from "./types.js";

export type CloudflareExecutionContext = { waitUntil: (work: Promise<void>) => void };

export function createCloudflareAiTraffic(config: AiTrafficConfig = {}): AiTrafficTracker {
  const tracker = createAiTraffic({ ...config, source: config.source || "cloudflare_worker" });
  return {
    ...tracker,
    track(request: RequestLike, options = {}) {
      try {
        const headers = request.headers as Headers | undefined;
        const ip = options.ip || headers?.get?.("cf-connecting-ip");
        return tracker.track(request, { ...options, ip });
      } catch {
        return Promise.resolve();
      }
    },
  };
}

export function trackCloudflareRequest(
  tracker: AiTrafficTracker,
  request: RequestLike,
  context: CloudflareExecutionContext,
): Promise<void> {
  try {
    return tracker.track(request, { waitUntil: context.waitUntil.bind(context) });
  } catch {
    return Promise.resolve();
  }
}
