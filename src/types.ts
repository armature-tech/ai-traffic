export type AiTrafficDelivery = "background" | "await";

export type AiTrafficErrorContext = {
  phase: "config" | "queue" | "delivery" | "schedule";
  droppedEvents?: number;
};

export type AiTrafficConfig = {
  apiKey?: string;
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  delivery?: AiTrafficDelivery;
  schedule?: (work: Promise<void>) => void;
  timeoutMs?: number;
  retryCount?: number;
  batchSize?: number;
  batchWindowMs?: number;
  queueCapacity?: number;
  captureOtherBots?: boolean;
  unknownBotSampleRate?: number;
  source?: string;
  onError?: (error: unknown, context: AiTrafficErrorContext) => void;
};

export type RequestLike = {
  url?: string;
  method?: string;
  headers?: Headers | Record<string, string | string[] | undefined>;
};

export type TrackRequestOptions = {
  ip?: string | null;
  source?: string;
  statusCode?: number | null;
  waitUntil?: (work: Promise<void>) => void;
};

export type AiTrafficEvent = {
  eventId: string;
  observedAt: string;
  source: string;
  hostname: string;
  path: string;
  method: "GET" | "HEAD";
  statusCode?: number;
  userAgent: string;
  ip?: string;
  sampleRate?: number;
};

export class AiTrafficHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSec?: number;

  constructor(message: string, options: { status: number; code?: string; retryAfterSec?: number }) {
    super(message);
    this.name = "AiTrafficHttpError";
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSec = options.retryAfterSec;
  }
}

export type AiTrafficBatch = {
  schemaVersion: 1;
  sdk: { name: "@armature-tech/ai-traffic"; version: string };
  events: AiTrafficEvent[];
};

export type AiTrafficTracker = {
  track: (request: RequestLike, options?: TrackRequestOptions) => Promise<void>;
  flush: () => Promise<void>;
  pending: () => number;
};
