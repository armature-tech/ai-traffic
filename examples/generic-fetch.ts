import { createAiTraffic } from "@armature-tech/ai-traffic";

const traffic = createAiTraffic({
  apiKey: process.env.ARMATURE_AI_TRAFFIC_API_KEY,
  source: "generic_fetch",
});

export function track(request: Request, waitUntil: (work: Promise<void>) => void, ip?: string) {
  void traffic.track(request, { waitUntil, ip });
}
