import { createAiTraffic } from "./core.js";
import type { AiTrafficConfig, AiTrafficTracker } from "./types.js";

export type HonoLikeContext = {
  req: { raw: Request; header?: (name: string) => string | undefined };
  executionCtx?: { waitUntil: (work: Promise<void>) => void };
};

export type HonoAiTrafficConfig = AiTrafficConfig & {
  getIp?: (context: HonoLikeContext) => string | null | undefined;
  ipHeader?: string;
};

export type HonoAiTrafficTracker = AiTrafficTracker & {
  trackContext: (context: HonoLikeContext) => Promise<void>;
};

function readWaitUntil(context: HonoLikeContext): ((work: Promise<void>) => void) | undefined {
  try {
    return context.executionCtx?.waitUntil.bind(context.executionCtx);
  } catch {
    // Hono exposes a throwing executionCtx getter outside Workers runtimes.
    return undefined;
  }
}

export function createHonoAiTraffic(config: HonoAiTrafficConfig = {}): HonoAiTrafficTracker {
  const tracker = createAiTraffic({ ...config, source: config.source || "hono" });
  return {
    ...tracker,
    trackContext(context) {
      const ip = config.getIp?.(context)
        || (config.ipHeader ? context.req.header?.(config.ipHeader) || context.req.raw.headers.get(config.ipHeader) : null);
      return tracker.track(context.req.raw, {
        ip,
        waitUntil: readWaitUntil(context),
      });
    },
  };
}

export function trackHonoRequest(tracker: HonoAiTrafficTracker, context: HonoLikeContext): Promise<void> {
  try {
    return tracker.trackContext(context);
  } catch {
    return Promise.resolve();
  }
}
