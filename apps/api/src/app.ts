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
import { runsRouter } from "./routes/files.ts";
import { editorRouter } from "./routes/editor.ts";

export { pipelineWebsocket };

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestIdMiddleware);

if (config.allowedOrigin) {
  app.use(
    "*",
    cors({
      origin: config.allowedOrigin,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Request-Id", "If-Match"],
      exposeHeaders: ["X-Request-Id", "ETag"],
    }),
  );
}

app.route("/api/configs", configsRouter);
app.route("/api/voicevox", voicevoxProxyRouter);
app.route("/api/pipeline", pipelineRouter);
app.route("/api/runs", runsRouter);
app.route("/api/editor", editorRouter);

app.get("/ws/pipeline/:jobId", pipelineWsRoute);

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "narrative-vox-api",
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  });
});

app.get("/", (c) => c.text("Narrative Vox API server is running."));

export { app };
