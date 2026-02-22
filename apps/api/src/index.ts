import { app, pipelineWebsocket } from "./app.ts";
import { config } from "./config.ts";

Bun.serve({
	fetch: app.fetch,
	websocket: pipelineWebsocket,
	hostname: config.host,
	port: config.port,
});

console.log(`[server] listening on http://${config.host}:${config.port}`);
