import { isAbsolute, join } from "node:path";
import type {
  JobCancelResult,
  JobStartResult,
  LogEntry,
  PipelineRunRequest,
} from "@narrative-vox/api-types";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { config } from "../config.ts";
import { auditApiEvent } from "../lib/audit-log.ts";
import { problem, STATUS_400, STATUS_404, STATUS_429 } from "../lib/problem.ts";
import { createFixedWindowRateLimiter } from "../lib/rate-limit.ts";
import { isAllowedVoicevoxUrl } from "../lib/voicevox-url.ts";
import type { AppVariables } from "../types.ts";

// ---------------------------------------------------------------------------
// 許可コマンド enum
// ---------------------------------------------------------------------------

const ALLOWED_COMMANDS = [
  // Layer 1
  "gen-blueprint",
  "gen-material",
  "gen-script",
  "gen-digest",
  // Layer 2 (既存)
  "build-text",
  "patch-voicevox-text",
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

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const EPISODE_ID_PATTERN = /^E\d{2}$/;
const RUN_ID_PATTERN = /^run-\d{8}-\d{4}$/;
const SAFE_TEXT_PATTERN = /^[A-Za-z0-9._:-]+$/;
const RUN_DIR_PATTERN =
  /^data\/projects\/[a-z0-9][a-z0-9_-]*\/run-\d{8}-\d{4}$/;
const SCRIPT_PATH_PATTERN =
  /^data\/projects\/[a-z0-9][a-z0-9_-]*\/run-\d{8}-\d{4}\/script\/E\d{2}_script\.md$/;
const VOICEVOX_TEXT_PATH_PATTERN =
  /^data\/projects\/[a-z0-9][a-z0-9_-]*\/run-\d{8}-\d{4}\/voicevox_text\/E\d{2}_voicevox_text(?:\.patched)?\.json$/;
const VVPROJ_PATH_PATTERN =
  /^data\/projects\/[a-z0-9][a-z0-9_-]*\/run-\d{8}-\d{4}\/voicevox_project\/E\d{2}\.vvproj$/;

type ArgRule = {
  expectsValue: boolean;
  validate?: (value: string) => boolean;
};

type CommandArgSpec = Record<string, ArgRule>;

function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes("\0")) return false;
  if (isAbsolute(value)) return false;
  return !value.split("/").some((segment) => segment === "..");
}

function isSafeConfigPath(value: string): boolean {
  return (
    isSafeRelativePath(value) &&
    value.startsWith("configs/") &&
    value.endsWith(".json")
  );
}

function isSafeRunDir(value: string): boolean {
  return isSafeRelativePath(value) && RUN_DIR_PATTERN.test(value);
}

function isSafeScriptPath(value: string): boolean {
  return isSafeRelativePath(value) && SCRIPT_PATH_PATTERN.test(value);
}

function isSafeVoicevoxTextPath(value: string): boolean {
  return isSafeRelativePath(value) && VOICEVOX_TEXT_PATH_PATTERN.test(value);
}

function isSafeVvprojPath(value: string): boolean {
  return isSafeRelativePath(value) && VVPROJ_PATH_PATTERN.test(value);
}

function isSafeVoicevoxUrl(value: string): boolean {
  return isAllowedVoicevoxUrl(value);
}

function isFiniteNumberValue(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function isIntegerValue(value: string): boolean {
  if (!/^-?\d+$/.test(value)) return false;
  return Number.isSafeInteger(Number(value));
}

const COMMAND_ARG_SPECS: Record<AllowedCommand, CommandArgSpec> = {
  "gen-blueprint": {
    "project-id": {
      expectsValue: true,
      validate: (v) => PROJECT_ID_PATTERN.test(v),
    },
  },
  "gen-material": {
    "project-id": {
      expectsValue: true,
      validate: (v) => PROJECT_ID_PATTERN.test(v),
    },
    "episode-id": {
      expectsValue: true,
      validate: (v) => EPISODE_ID_PATTERN.test(v),
    },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
  },
  "gen-script": {
    "project-id": {
      expectsValue: true,
      validate: (v) => PROJECT_ID_PATTERN.test(v),
    },
    "episode-id": {
      expectsValue: true,
      validate: (v) => EPISODE_ID_PATTERN.test(v),
    },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
  },
  "gen-digest": {
    "project-id": {
      expectsValue: true,
      validate: (v) => PROJECT_ID_PATTERN.test(v),
    },
    "episode-id": {
      expectsValue: true,
      validate: (v) => EPISODE_ID_PATTERN.test(v),
    },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
  },
  "build-text": {
    script: { expectsValue: true, validate: isSafeScriptPath },
    "build-text-config": { expectsValue: true, validate: isSafeConfigPath },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
    "episode-id": {
      expectsValue: true,
      validate: (v) => EPISODE_ID_PATTERN.test(v),
    },
    "project-id": {
      expectsValue: true,
      validate: (v) => PROJECT_ID_PATTERN.test(v),
    },
    "run-id": { expectsValue: true, validate: (v) => RUN_ID_PATTERN.test(v) },
  },
  "patch-voicevox-text": {
    "voicevox-text-json": {
      expectsValue: true,
      validate: isSafeVoicevoxTextPath,
    },
    "patch-config": { expectsValue: true, validate: isSafeConfigPath },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
  },
  "build-project": {
    "voicevox-text-json": {
      expectsValue: true,
      validate: isSafeVoicevoxTextPath,
    },
    "use-patched": { expectsValue: false },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
    "synthesis-defaults": { expectsValue: true, validate: isSafeConfigPath },
    "character-map": { expectsValue: true, validate: isSafeConfigPath },
    "character-key": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "engine-id": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "speaker-id": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "style-id": { expectsValue: true, validate: isIntegerValue },
    emotion: { expectsValue: true, validate: (v) => SAFE_TEXT_PATTERN.test(v) },
    "app-version": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "voicevox-url": { expectsValue: true, validate: isSafeVoicevoxUrl },
    "speed-preset": {
      expectsValue: true,
      validate: (v) => ["slow", "normal", "fast"].includes(v),
    },
    "speed-profiles": { expectsValue: true, validate: isSafeConfigPath },
    "intonation-scale": { expectsValue: true, validate: isFiniteNumberValue },
  },
  "build-audio": {
    vvproj: { expectsValue: true, validate: isSafeVvprojPath },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
    "voicevox-url": { expectsValue: true, validate: isSafeVoicevoxUrl },
    "compressed-format": {
      expectsValue: true,
      validate: (v) => ["mp3", "m4a", "ogg", "none"].includes(v),
    },
    "compressed-bitrate-kbps": { expectsValue: true, validate: isIntegerValue },
  },
  "build-all": {
    script: { expectsValue: true, validate: isSafeScriptPath },
    patch: { expectsValue: false },
    "patch-config": { expectsValue: true, validate: isSafeConfigPath },
    "build-text-config": { expectsValue: true, validate: isSafeConfigPath },
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
    "run-id": { expectsValue: true, validate: (v) => RUN_ID_PATTERN.test(v) },
    dict: { expectsValue: true, validate: isSafeConfigPath },
    "project-id": {
      expectsValue: true,
      validate: (v) => PROJECT_ID_PATTERN.test(v),
    },
    "episode-id": {
      expectsValue: true,
      validate: (v) => EPISODE_ID_PATTERN.test(v),
    },
  },
  "check-run": {
    "run-dir": { expectsValue: true, validate: isSafeRunDir },
    "synthesis-defaults": { expectsValue: true, validate: isSafeConfigPath },
    "character-map": { expectsValue: true, validate: isSafeConfigPath },
    "character-key": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "engine-id": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "speaker-id": {
      expectsValue: true,
      validate: (v) => SAFE_TEXT_PATTERN.test(v),
    },
    "style-id": { expectsValue: true, validate: isIntegerValue },
    emotion: { expectsValue: true, validate: (v) => SAFE_TEXT_PATTERN.test(v) },
    "voicevox-url": { expectsValue: true, validate: isSafeVoicevoxUrl },
    "speed-preset": {
      expectsValue: true,
      validate: (v) => ["slow", "normal", "fast"].includes(v),
    },
    "speed-profiles": { expectsValue: true, validate: isSafeConfigPath },
  },
  "prepare-run": {
    "source-run-dir": { expectsValue: true, validate: isSafeRunDir },
  },
  "dict-sync": {
    "voicevox-url": { expectsValue: true, validate: isSafeVoicevoxUrl },
    dict: { expectsValue: true, validate: isSafeConfigPath },
    "dry-run": { expectsValue: false },
    "legacy-sync": { expectsValue: false },
  },
};

function validateCommandArgs(
  command: AllowedCommand,
  args: string[],
): { ok: true } | { ok: false; detail: string } {
  const spec = COMMAND_ARG_SPECS[command];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      return { ok: false, detail: `Invalid argument token: ${token}` };
    }
    const flag = token.slice(2);
    const rule = spec[flag];
    if (!rule) {
      return { ok: false, detail: `Unknown flag for ${command}: --${flag}` };
    }
    if (!rule.expectsValue) {
      continue;
    }
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      return { ok: false, detail: `Flag --${flag} requires a value` };
    }
    if (rule.validate && !rule.validate(value)) {
      return { ok: false, detail: `Invalid value for --${flag}: ${value}` };
    }
    i += 1;
  }
  return { ok: true };
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
  nextSeq: number;
  ttlTimer?: ReturnType<typeof setTimeout>;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 分
const LOG_TTL_MS = 30 * 60 * 1000; // 終了ジョブの TTL 30 分
const LOG_RING_SIZE = 500; // リングバッファサイズ
const RUN_RATE_LIMIT = createFixedWindowRateLimiter(10, 60_000);

// ---------------------------------------------------------------------------
// グローバル状態
// ---------------------------------------------------------------------------

/** 実行中ジョブ（同時に 1 つのみ） */
let runningJob: Job | null = null;

/** 終了ジョブのキャッシュ（TTL 付き） */
const completedJobs = new Map<string, Job>();

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function pushLog(job: Job, entry: Omit<LogEntry, "seq">): void {
  const logEntry: LogEntry = { ...entry, seq: job.nextSeq++ };
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

  const rateLimit = RUN_RATE_LIMIT();
  if (!rateLimit.ok) {
    const res = problem(c, {
      title: "Too many pipeline run attempts",
      status: STATUS_429,
      detail: "Retry later",
      errorCode: "RATE_LIMITED",
    });
    res.headers.set("Retry-After", String(rateLimit.retryAfterSec));
    return res;
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

  const { command, args } = body as Partial<PipelineRunRequest>;

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

  const validatedArgs = validateCommandArgs(command, resolvedArgs as string[]);
  if (!validatedArgs.ok) {
    return problem(c, {
      title: "Invalid args",
      status: STATUS_400,
      detail: validatedArgs.detail,
      errorCode: "INVALID_ARGS",
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
    nextSeq: 1,
  };
  runningJob = job;
  startJob(job);

  await auditApiEvent(c, {
    action: "pipeline.run",
    status: 202,
    command: job.command,
  });

  const response: JobStartResult = {
    jobId: job.id,
    command: job.command,
    args: job.args,
    startedAt: job.startedAt,
  };
  return c.json(response, 202);
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
  await auditApiEvent(c, {
    action: "pipeline.cancel",
    status: 200,
    command: job.command,
  });
  const response: JobCancelResult = {
    jobId: job.id,
    status: job.status,
    cancelled: true,
  };
  return c.json(response);
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
            seq: 0,
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
