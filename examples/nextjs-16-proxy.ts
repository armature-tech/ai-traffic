import { createVercelAiTraffic, trackVercelRequest } from "@armature-tech/ai-traffic/vercel";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const traffic = createVercelAiTraffic({ apiKey: process.env.ARMATURE_AI_TRAFFIC_API_KEY });

export function proxy(request: NextRequest, event: NextFetchEvent) {
  void trackVercelRequest(traffic, request, event);
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
