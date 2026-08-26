import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { createVercelAiTraffic, trackVercelRequest } from "../../../dist/esm/vercel.js";

const traffic = createVercelAiTraffic({
  apiKey: process.env.ARMATURE_AI_TRAFFIC_API_KEY,
  endpoint: "http://localhost:9/ingest",
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  void trackVercelRequest(traffic, request, event);
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
