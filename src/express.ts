import { createAiTraffic } from "./core.js";
import { candidateDecision } from "./catalog.js";
import type { AiTrafficConfig, AiTrafficTracker, RequestLike } from "./types.js";

type ExpressRequest = RequestLike & {
  protocol?: string;
  originalUrl?: string;
  get?: (name: string) => string | undefined;
  ip?: string;
};
type ExpressResponse = { statusCode?: number; once?: (event: string, callback: () => void) => void };
type ExpressNext = (error?: unknown) => void;

export type ExpressAiTrafficConfig = AiTrafficConfig & {
  getIp?: (request: ExpressRequest) => string | null | undefined;
  ipHeader?: string;
};

export type ExpressAiTrafficMiddleware = ((req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => void) & {
  flush: () => Promise<void>;
  tracker: AiTrafficTracker;
};

export function aiTrafficMiddleware(config: ExpressAiTrafficConfig = {}): ExpressAiTrafficMiddleware {
  const tracker = createAiTraffic({
    ...config,
    source: config.source || "express",
    schedule: config.schedule || ((work) => { void work; }),
  });
  const middleware = ((req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => {
    try {
      const host = req.get?.("host") || "localhost";
      const protocol = req.protocol || "https";
      const url = req.url?.startsWith("http") ? req.url : `${protocol}://${host}${req.originalUrl || req.url || "/"}`;
      const request: RequestLike = { url, method: req.method, headers: req.headers };
      const userAgent = req.get?.("user-agent") || String((req.headers as Record<string, string | string[] | undefined> | undefined)?.["user-agent"] || "");
      const candidate = candidateDecision({
        userAgent,
        path: new URL(url).pathname,
        method: req.method || "GET",
        captureOtherBots: true,
      });
      if (candidate.track) {
        const configuredHeader = config.ipHeader ? req.get?.(config.ipHeader) : undefined;
        const ip = config.getIp?.(req) || configuredHeader || req.ip;
        res.once?.("finish", () => {
          void tracker.track(request, { ip, statusCode: res.statusCode });
        });
      }
    } catch {
      // Analytics must not affect Express routing.
    }
    next();
  }) as ExpressAiTrafficMiddleware;
  middleware.flush = tracker.flush;
  middleware.tracker = tracker;
  return middleware;
}
