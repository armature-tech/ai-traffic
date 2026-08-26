import express from "express";
import { aiTrafficMiddleware } from "@armature-tech/ai-traffic/express";

const app = express();
app.use(aiTrafficMiddleware({ apiKey: process.env.ARMATURE_AI_TRAFFIC_API_KEY }));
