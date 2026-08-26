import { createCloudflareAiTraffic, trackCloudflareRequest } from "@armature-tech/ai-traffic/cloudflare";

export default {
  async fetch(request: Request, env: { ARMATURE_AI_TRAFFIC_API_KEY: string }, context: ExecutionContext) {
    const traffic = createCloudflareAiTraffic({ apiKey: env.ARMATURE_AI_TRAFFIC_API_KEY });
    void trackCloudflareRequest(traffic, request, context);
    return new Response("ok");
  },
};
