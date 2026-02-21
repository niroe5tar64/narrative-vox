import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { requestIdMiddleware } from "./middleware/request-id.ts";
import type { AppVariables } from "./types.ts";
import { configsRouter } from "./routes/configs.ts";
import { voicevoxProxyRouter } from "./routes/voicevox-proxy.ts";
import {
  pipelineRouter,
  pipelineWsRoute,
  pipelineWebsocket,
} from "./routes/pipeline.ts";

const app = new Hono<{ Variables: AppVariables }>();

// requestId ミドルウェア（全ルートに適用）
app.use("*", requestIdMiddleware);

// CORS: ALLOWED_ORIGIN が設定されている場合のみ許可する（未設定 = 同一オリジン制約）
if (config.allowedOrigin) {
  app.use(
    "*",
    cors({
      origin: config.allowedOrigin,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
    }),
  );
}

app.route("/api/configs", configsRouter);
app.route("/api/voicevox", voicevoxProxyRouter);
app.route("/api/pipeline", pipelineRouter);

// WS: Pipeline リアルタイムログ
app.get("/ws/pipeline/:jobId", pipelineWsRoute);

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "narrative-vox-api",
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  });
});

app.get("/", (c) => {
  return c.text("Narrative Vox API server is running.");
});

Bun.serve({
  fetch: app.fetch,
  websocket: pipelineWebsocket,
  hostname: config.host,
  port: config.port,
});

console.log(`[server] listening on http://${config.host}:${config.port}`);
