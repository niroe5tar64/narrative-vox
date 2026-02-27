import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Context } from "hono";
import { config } from "../config.ts";
import type { AppVariables } from "../types.ts";

type AuditEvent = {
  ts: string;
  requestId: string;
  route: string;
  method: string;
  status: number;
  action: string;
  projectId?: string;
  runId?: string;
  command?: string;
  configName?: string;
};

function getAuditLogPath(ts: string): string {
  const day = ts.slice(0, 10);
  return join(config.repoRoot, "data", "logs", `api-audit-${day}.jsonl`);
}

export async function appendAuditLog(event: AuditEvent): Promise<void> {
  const filePath = getAuditLogPath(event.ts);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`);
}

export async function auditApiEvent(
  c: Context<{ Variables: AppVariables }>,
  event: Omit<AuditEvent, "ts" | "requestId" | "route" | "method" | "status"> & {
    status: number;
  },
): Promise<void> {
  const ts = new Date().toISOString();
  try {
    await appendAuditLog({
      ts,
      requestId: c.get("requestId") ?? "",
      route: new URL(c.req.url).pathname,
      method: c.req.method,
      status: event.status,
      action: event.action,
      projectId: event.projectId,
      runId: event.runId,
      command: event.command,
      configName: event.configName,
    });
  } catch {
    // Audit logging is fail-open for developer ergonomics.
  }
}
