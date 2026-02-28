import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { problem, STATUS_413 } from "./lib/problem.ts";
import { requestIdMiddleware } from "./middleware/request-id.ts";
import { configsRouter } from "./routes/configs.ts";
import { editorRouter } from "./routes/editor.ts";
import { runsRouter } from "./routes/files.ts";
import {
  pipelineRouter,
  pipelineWebsocket,
  pipelineWsRoute,
} from "./routes/pipeline.ts";
import { voicevoxProxyRouter } from "./routes/voicevox-proxy.ts";
import type { AppVariables } from "./types.ts";

export { pipelineWebsocket };

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestIdMiddleware);

const jsonBodyLimit = bodyLimit({
  maxSize: 1 * 1024 * 1024,
  onError: (c) =>
    problem(c, {
      title: "Payload Too Large",
      status: STATUS_413,
      detail: "Request body exceeds 1MB limit",
      errorCode: "PAYLOAD_TOO_LARGE",
    }),
});

const synthesisBodyLimit = bodyLimit({
  maxSize: 10 * 1024 * 1024,
  onError: (c) =>
    problem(c, {
      title: "Payload Too Large",
      status: STATUS_413,
      detail: "Request body exceeds 10MB limit for synthesis endpoint",
      errorCode: "PAYLOAD_TOO_LARGE",
    }),
});

app.use("/api/voicevox/synthesis", synthesisBodyLimit);
app.use("/api/*", (c, next) => {
  if (c.req.path === "/api/voicevox/synthesis") {
    return next();
  }
  return jsonBodyLimit(c, next);
});

app.use(
  "*",
  cors({
    origin: (origin) =>
      !origin || origin === config.allowedOrigin
        ? (origin ?? config.allowedOrigin)
        : "",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Request-Id", "If-Match"],
    exposeHeaders: ["X-Request-Id", "ETag", "Retry-After"],
  }),
);

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
