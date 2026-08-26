import { createAiTraffic } from "./core.js";
import type { AiTrafficConfig, AiTrafficTracker, RequestLike } from "./types.js";

export type VercelRequestContext = { waitUntil: (work: Promise<void>) => void };

export function createVercelAiTraffic(config: AiTrafficConfig = {}): AiTrafficTracker {
  const tracker = createAiTraffic({ ...config, source: config.source || "vercel_routing_middleware" });
  return {
    ...tracker,
    track(request: RequestLike, options = {}) {
      try {
        const headers = request.headers as Headers | undefined;
        const ip = options.ip || headers?.get?.("x-real-ip") || headers?.get?.("x-vercel-forwarded-for")?.split(",")[0]?.trim();
        return tracker.track(request, { ...options, ip });
      } catch {
        return Promise.resolve();
      }
    },
  };
}

export function trackVercelRequest(
  tracker: AiTrafficTracker,
  request: RequestLike,
  context: VercelRequestContext,
): Promise<void> {
  try {
    return tracker.track(request, { waitUntil: context.waitUntil.bind(context) });
  } catch {
    return Promise.resolve();
  }
}
