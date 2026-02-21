import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "narrative-vox-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (c) => {
  return c.text("Narrative Vox API server is running.");
});

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

Bun.serve({
  fetch: app.fetch,
  hostname,
  port,
});

console.log(`[server] listening on http://${hostname}:${port}`);
