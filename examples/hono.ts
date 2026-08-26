import { Hono } from "hono";
import { createHonoAiTraffic, trackHonoRequest } from "@armature-tech/ai-traffic/hono";

const app = new Hono();
const traffic = createHonoAiTraffic({
  apiKey: process.env.ARMATURE_AI_TRAFFIC_API_KEY,
  // Set this to a header that your trusted proxy writes.
  ipHeader: "x-real-ip",
});
app.use("*", async (context, next) => {
  void trackHonoRequest(traffic, context);
  await next();
});
