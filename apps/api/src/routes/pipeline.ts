import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { config } from "../config.ts";
import { problem, STATUS_400, STATUS_404 } from "../lib/problem.ts";
import type { AppVariables } from "../types.ts";

// ---------------------------------------------------------------------------
// 許可コマンド enum
// ---------------------------------------------------------------------------

const ALLOWED_COMMANDS = [
  "build-text",
  "build-project",
  "build-audio",
  "build-all",
  "check-run",
  "prepare-run",
  "dict-sync",
] as const;

type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

function isAllowedCommand(cmd: string): cmd is AllowedCommand {
  return (ALLOWED_COMMANDS as readonly string[]).includes(cmd);
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface LogEntry {
  /** ログ種別 */
  type: "stdout" | "stderr" | "system";
  /** ログ本文 */
  data: string;
  /** ISO8601 タイムスタンプ */
  ts: string;
  /** 単調増加シーケンス番号 */
  seq: number;
  /** 終了コード（system イベントのみ） */
  code?: number;
  /** キャンセルによる終了（system イベントのみ） */
  cancelled?: boolean;
}

/** WebSocket 送信インタフェース（Hono WSContext の send のみ使用） */
type Subscriber = WSContext<ServerWebSocket>;

/** シンプルなプロセス操作インタフェース（job.proc に格納） */
interface JobProcess {
  readonly exited: Promise<number>;
  readonly stdout: ReadableStream<Uint8Array> | null;
  readonly stderr: ReadableStream<Uint8Array> | null;
  kill(signal?: string | number): void;
}

interface Job {
  id: string;
  command: string;
  args: string[];
  status: "running" | "done" | "cancelled" | "error";
  startedAt: string;
  endedAt?: string;
  proc?: JobProcess;
  /** リングバッファ（最大 LOG_RING_SIZE 件） */
  logs: LogEntry[];
  subscribers: Set<Subscriber>;
  exitCode?: number;
  cancelled: boolean;
  ttlTimer?: ReturnType<typeof setTimeout>;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 分
const LOG_TTL_MS = 30 * 60 * 1000; // 終了ジョブの TTL 30 分
const LOG_RING_SIZE = 500; // リングバッファサイズ

// ---------------------------------------------------------------------------
// グローバル状態
// ---------------------------------------------------------------------------

/** 実行中ジョブ（同時に 1 つのみ） */
let runningJob: Job | null = null;

/** 終了ジョブのキャッシュ（TTL 付き） */
const completedJobs = new Map<string, Job>();

/** ログシーケンス番号（単調増加） */
let seqCounter = 0;

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function pushLog(job: Job, entry: Omit<LogEntry, "seq">): void {
  const logEntry: LogEntry = { ...entry, seq: ++seqCounter };
  if (job.logs.length >= LOG_RING_SIZE) {
    job.logs.shift(); // 古いエントリを削除
  }
  job.logs.push(logEntry);
  const payload = JSON.stringify(logEntry);
  for (const ws of job.subscribers) {
    try {
      ws.send(payload);
    } catch {
      // 切断済みの subscriber は無視
    }
  }
}

async function streamLines(
  stream: ReadableStream<Uint8Array>,
  type: "stdout" | "stderr",
  job: Job,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        pushLog(job, { type, data: line, ts: new Date().toISOString() });
      }
    }
    if (buffer.length > 0) {
      pushLog(job, { type, data: buffer, ts: new Date().toISOString() });
    }
  } finally {
    reader.releaseLock();
  }
}

async function cancelJobProcess(job: Job): Promise<void> {
  if (!job.proc || job.status !== "running") return;
  job.cancelled = true;
  try {
    job.proc.kill("SIGTERM");
  } catch {
    return; // プロセスがすでに終了していた場合
  }
  // 3 秒後に SIGKILL
  const killTimer = setTimeout(() => {
    try {
      job.proc?.kill(9);
    } catch {
      // すでに終了していた場合は無視
    }
  }, 3000);
  try {
    await job.proc.exited;
  } finally {
    clearTimeout(killTimer);
  }
}

function scheduleJobCleanup(job: Job): void {
  job.ttlTimer = setTimeout(() => {
    completedJobs.delete(job.id);
  }, LOG_TTL_MS);
}

function finalizeJob(job: Job, exitCode: number): void {
  clearTimeout(job.timeoutHandle);
  job.endedAt = new Date().toISOString();
  job.exitCode = exitCode;
  job.status = job.cancelled ? "cancelled" : exitCode === 0 ? "done" : "error";
  pushLog(job, {
    type: "system",
    data: "Process exited",
    ts: job.endedAt,
    code: exitCode,
    ...(job.cancelled && { cancelled: true }),
  });
  runningJob = null;
  completedJobs.set(job.id, job);
  scheduleJobCleanup(job);
}

function startJob(job: Job): void {
  const cliPath = join(config.repoRoot, "apps/cli/src/main.ts");
  let spawnedProc: JobProcess;
  try {
    spawnedProc = Bun.spawn(
      [process.execPath, cliPath, job.command, ...job.args],
      {
        cwd: config.repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
  } catch (err) {
    job.status = "error";
    job.endedAt = new Date().toISOString();
    runningJob = null;
    pushLog(job, {
      type: "system",
      data: `Failed to start process: ${err instanceof Error ? err.message : String(err)}`,
      ts: job.endedAt,
      code: -1,
    });
    completedJobs.set(job.id, job);
    scheduleJobCleanup(job);
    return;
  }

  job.proc = spawnedProc;

  // タイムアウト設定（30 分）
  job.timeoutHandle = setTimeout(() => {
    if (job.status !== "running") return;
    pushLog(job, {
      type: "system",
      data: "Job timed out (30 minutes)",
      ts: new Date().toISOString(),
    });
    cancelJobProcess(job).catch(() => {
      /* ignore */
    });
  }, JOB_TIMEOUT_MS);

  const stdout = spawnedProc.stdout;
  const stderr = spawnedProc.stderr;

  Promise.all([
    stdout ? streamLines(stdout, "stdout", job) : Promise.resolve(),
    stderr ? streamLines(stderr, "stderr", job) : Promise.resolve(),
  ])
    .then(() => spawnedProc.exited)
    .then((exitCode: number) => finalizeJob(job, exitCode))
    .catch((err: unknown) => {
      clearTimeout(job.timeoutHandle);
      if (runningJob === job) runningJob = null;
      job.status = "error";
      job.endedAt = new Date().toISOString();
      pushLog(job, {
        type: "system",
        data: `Error: ${err instanceof Error ? err.message : String(err)}`,
        ts: job.endedAt,
        code: -1,
      });
      completedJobs.set(job.id, job);
      scheduleJobCleanup(job);
    });
}

// ---------------------------------------------------------------------------
// HTTP ルーター
// ---------------------------------------------------------------------------

export const pipelineRouter = new Hono<{ Variables: AppVariables }>();

/** POST /api/pipeline/run — ジョブ開始 */
pipelineRouter.post("/run", async (c) => {
  if (runningJob) {
    return problem(c, {
      title: "Job already running",
      status: STATUS_400,
      detail: `Job ${runningJob.id} is currently running`,
      errorCode: "JOB_ALREADY_RUNNING",
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return problem(c, { title: "Invalid JSON", status: STATUS_400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return problem(c, {
      title: "Request body must be a JSON object",
      status: STATUS_400,
    });
  }

  const { command, args } = body as Record<string, unknown>;

  if (typeof command !== "string" || !isAllowedCommand(command)) {
    return problem(c, {
      title: "Invalid command",
      status: STATUS_400,
      detail: `Allowed commands: ${ALLOWED_COMMANDS.join(", ")}`,
      errorCode: "INVALID_COMMAND",
    });
  }

  const resolvedArgs = args ?? [];
  if (
    !Array.isArray(resolvedArgs) ||
    !resolvedArgs.every((a) => typeof a === "string")
  ) {
    return problem(c, {
      title: "Invalid args",
      status: STATUS_400,
      detail: "args must be an array of strings",
    });
  }

  const job: Job = {
    id: crypto.randomUUID(),
    command,
    args: resolvedArgs as string[],
    status: "running",
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
    cancelled: false,
  };
  runningJob = job;
  startJob(job);

  return c.json(
    {
      jobId: job.id,
      command: job.command,
      args: job.args,
      startedAt: job.startedAt,
    },
    202,
  );
});

/** POST /api/pipeline/:jobId/cancel — ジョブキャンセル */
pipelineRouter.post("/:jobId/cancel", async (c) => {
  const jobId = c.req.param("jobId");
  const job = runningJob?.id === jobId ? runningJob : completedJobs.get(jobId);

  if (!job) {
    return problem(c, {
      title: "Job not found",
      status: STATUS_404,
      detail: `No job with id: ${jobId}`,
    });
  }

  if (job.status !== "running") {
    return c.json({ jobId: job.id, status: job.status, cancelled: false });
  }

  await cancelJobProcess(job);
  return c.json({ jobId: job.id, status: job.status, cancelled: true });
});

// ---------------------------------------------------------------------------
// WebSocket — リアルタイムログストリーミング
// ---------------------------------------------------------------------------

export const { upgradeWebSocket, websocket: pipelineWebsocket } =
  createBunWebSocket<ServerWebSocket>();

/**
 * WS /ws/pipeline/:jobId
 * - 接続時に直近 500 行のログを再送（リングバッファ再生）
 * - ジョブ実行中は新規ログをリアルタイム配信
 * - ジョブが見つからない場合は system イベントを送信して切断
 */
export const pipelineWsRoute = upgradeWebSocket((c) => {
  const jobId = c.req.param("jobId");
  let subscribedJob: Job | null = null;

  return {
    onOpen(_evt, ws) {
      const job =
        runningJob?.id === jobId ? runningJob : completedJobs.get(jobId);
      if (!job) {
        ws.send(
          JSON.stringify({
            type: "system",
            data: `Job not found: ${jobId}`,
            ts: new Date().toISOString(),
            seq: ++seqCounter,
          }),
        );
        ws.close(1008, "Job not found");
        return;
      }

      // リングバッファのログを再生（再接続時の最大 LOG_RING_SIZE 行）
      for (const entry of job.logs) {
        ws.send(JSON.stringify(entry));
      }

      // 実行中のジョブのみ購読登録
      if (job.status === "running") {
        subscribedJob = job;
        job.subscribers.add(ws);
      }
    },
    onClose(_evt, ws) {
      if (subscribedJob) {
        subscribedJob.subscribers.delete(ws);
        subscribedJob = null;
      }
    },
  };
});
