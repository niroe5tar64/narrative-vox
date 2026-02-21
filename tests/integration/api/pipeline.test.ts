/**
 * T12: ジョブ実行テスト + WebSocket テスト
 *
 * - 許可外 command が 400
 * - 同時 2 ジョブ拒否
 * - cancel 後の exit イベントで cancelled=true
 * - WebSocket: 再接続時 500 行再送
 * - WebSocket: seq による順序復元
 */

import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "bun:test";
import { app, pipelineWebsocket } from "../../../apps/api/src/app.ts";
import type { LogEntry } from "../../../apps/api/src/routes/pipeline.ts";

// ---------------------------------------------------------------------------
// サーバー起動 / 停止
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let wsBaseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: app.fetch,
    websocket: pipelineWebsocket,
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
  wsBaseUrl = `ws://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  // 念のため実行中ジョブをキャンセル
  try {
    const jobsRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "check-run", args: [] }),
    });
    if (jobsRes.status === 202) {
      const { jobId } = (await jobsRes.json()) as { jobId: string };
      await fetch(`${baseUrl}/api/pipeline/${jobId}/cancel`, { method: "POST" });
    }
  } catch {
    // 無視
  }
  server.stop(true);
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function startJob(command: string, args: string[] = []): Promise<{ jobId: string; status: number }> {
  const res = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { jobId: body.jobId as string, status: res.status };
}

async function cancelJob(jobId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/pipeline/${jobId}/cancel`, { method: "POST" });
}

/** WS に接続し、システム終了イベントが来るまで全ログを収集する（タイムアウト付き） */
function collectWsLogs(jobId: string, timeoutMs = 8000): Promise<LogEntry[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/pipeline/${jobId}`);
    const collected: LogEntry[] = [];

    const timer = setTimeout(() => {
      ws.close();
      resolve(collected); // タイムアウト時は収集済みを返す
    }, timeoutMs);

    ws.onmessage = (event: MessageEvent) => {
      const entry = JSON.parse(event.data as string) as LogEntry;
      collected.push(entry);
      // "Process exited" system イベントで完了とみなす
      if (entry.type === "system" && entry.data === "Process exited") {
        clearTimeout(timer);
        ws.close();
        resolve(collected);
      }
    };

    ws.onclose = () => {
      clearTimeout(timer);
      resolve(collected);
    };

    ws.onerror = () => {
      clearTimeout(timer);
      // エラー時もとりあえず解決（テスト内で空チェック）
      resolve(collected);
    };
  });
}

/** WS に接続し、500ms 後に切断して収集済みログを返す（再接続テスト用） */
function replayWsLogs(jobId: string): Promise<LogEntry[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/pipeline/${jobId}`);
    const collected: LogEntry[] = [];

    const timer = setTimeout(() => {
      ws.close();
    }, 500);

    ws.onmessage = (event: MessageEvent) => {
      const entry = JSON.parse(event.data as string) as LogEntry;
      collected.push(entry);
    };

    ws.onclose = () => {
      clearTimeout(timer);
      resolve(collected);
    };

    ws.onerror = () => {
      clearTimeout(timer);
      resolve(collected);
    };
  });
}

// ---------------------------------------------------------------------------
// ジョブ実行テスト
// ---------------------------------------------------------------------------

test("許可外 command は 400 INVALID_COMMAND を返す", async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "rm -rf /", args: [] }),
  });

  assert.equal(res.status, 400);
  assert.equal(res.headers.get("content-type"), "application/problem+json");
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.status, 400);
  assert.equal(body.errorCode, "INVALID_COMMAND");
});

test("args が配列でない場合は 400 を返す", async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "check-run", args: "not-an-array" }),
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.status, 400);
});

test("args に文字列以外の要素が含まれる場合は 400 を返す", async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "check-run", args: ["--run-dir", 123] }),
  });

  assert.equal(res.status, 400);
});

test("同時 2 ジョブ: 2 番目は 400 JOB_ALREADY_RUNNING を返す", async () => {
  // ジョブ 1 を開始
  const { jobId, status: status1 } = await startJob("build-audio", []);
  assert.equal(status1, 202, "最初のジョブは 202 Accepted");

  // ジョブ 2 を即座に開始 → 拒否されるはず
  const res2 = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "check-run", args: [] }),
  });

  assert.equal(res2.status, 400);
  const body2 = (await res2.json()) as Record<string, unknown>;
  assert.equal(body2.errorCode, "JOB_ALREADY_RUNNING");

  // クリーンアップ: ジョブ 1 をキャンセル
  await cancelJob(jobId);
});

test("存在しないジョブのキャンセルは 404 を返す", async () => {
  const res = await cancelJob("00000000-0000-0000-0000-000000000000");
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("content-type"), "application/problem+json");
});

test("ジョブをキャンセルすると { cancelled } フィールドを持つレスポンスが返る", async () => {
  const { jobId, status } = await startJob("build-audio", []);
  assert.equal(status, 202);

  // 少し待ってからキャンセル（プロセス起動時間の余裕）
  await new Promise((r) => setTimeout(r, 200));

  const cancelRes = await cancelJob(jobId);
  assert.ok(
    cancelRes.status === 200 || cancelRes.status === 202,
    `キャンセルレスポンスは 2xx: ${cancelRes.status}`,
  );
  const body = (await cancelRes.json()) as Record<string, unknown>;
  assert.equal(body.jobId, jobId);
  assert.ok(typeof body.cancelled === "boolean", "cancelled フィールドが boolean");
  assert.ok(typeof body.status === "string", "status フィールドが string");
});

// ---------------------------------------------------------------------------
// WebSocket テスト
// ---------------------------------------------------------------------------

test("WS: 存在しないジョブに接続すると 1008 でクローズされる", async () => {
  const nonExistentId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  const { closeCode, messages } = await new Promise<{
    closeCode: number;
    messages: LogEntry[];
  }>((resolve) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/pipeline/${nonExistentId}`);
    const collected: LogEntry[] = [];

    ws.onmessage = (event: MessageEvent) => {
      collected.push(JSON.parse(event.data as string) as LogEntry);
    };

    ws.onclose = (event: CloseEvent) => {
      resolve({ closeCode: event.code, messages: collected });
    };

    ws.onerror = () => {
      resolve({ closeCode: -1, messages: collected });
    };

    setTimeout(() => {
      ws.close();
      resolve({ closeCode: -1, messages: collected });
    }, 3000);
  });

  assert.equal(closeCode, 1008, "Job not found は 1008 Policy Violation でクローズ");
  // system メッセージが送信されていること
  assert.ok(messages.length > 0, "切断前に system メッセージが届く");
  assert.equal(messages[0].type, "system");
});

test("WS: 完了したジョブのログを seq 昇順で受信できる", async () => {
  // ジョブを開始し、完了まで WS で待機
  const { jobId, status } = await startJob("check-run", ["--run-dir", "/tmp/nonexistent-test-run"]);
  assert.equal(status, 202);

  const messages = await collectWsLogs(jobId, 10000);

  assert.ok(messages.length > 0, "何らかのログが受信できること");

  // seq の単調増加を確認
  for (let i = 1; i < messages.length; i++) {
    assert.ok(
      messages[i].seq > messages[i - 1].seq,
      `seq[${i}]=${messages[i].seq} > seq[${i - 1}]=${messages[i - 1].seq} であること`,
    );
  }

  // 最後のメッセージが system exit イベントであること
  const lastMsg = messages.at(-1);
  assert.ok(lastMsg !== undefined);
  assert.equal(lastMsg.type, "system");
  assert.ok(typeof lastMsg.code === "number", "終了コードが含まれる");
});

test("WS: 再接続時にリングバッファのログが再送される", async () => {
  // 別のジョブを開始・完了させる
  const { jobId, status } = await startJob("check-run", ["--run-dir", "/tmp/nonexistent-replay-test"]);
  assert.equal(status, 202);

  // 最初の接続で完了まで待機
  const firstConnection = await collectWsLogs(jobId, 10000);
  assert.ok(firstConnection.length > 0, "初回接続でログが届く");

  // 再接続してリプレイを受信
  const replayed = await replayWsLogs(jobId);
  assert.ok(replayed.length > 0, "再接続時にバッファが再送される");

  // 初回と同じログが届いていること（seq で確認）
  const firstSeqs = firstConnection.map((m) => m.seq);
  const replaySeqs = replayed.map((m) => m.seq);
  assert.deepEqual(replaySeqs, firstSeqs, "再接続でも同じ seq 順でログが届く");

  // seq の単調増加
  for (let i = 1; i < replayed.length; i++) {
    assert.ok(
      replayed[i].seq > replayed[i - 1].seq,
      `再接続 seq[${i}] > seq[${i - 1}]`,
    );
  }
});

test("WS: cancel されたジョブの終了イベントには cancelled=true が含まれる", async () => {
  // build-audio は VOICEVOX 未起動環境でもプロセス起動に時間がかかるためキャンセルに使う
  const { jobId, status } = await startJob("build-audio", []);
  assert.equal(status, 202);

  // 接続してメッセージ収集を開始
  const collectPromise = collectWsLogs(jobId, 10000);

  // 少し待ってからキャンセル
  await new Promise((r) => setTimeout(r, 200));
  const cancelRes = await cancelJob(jobId);
  const cancelBody = (await cancelRes.json()) as Record<string, unknown>;

  const messages = await collectPromise;

  if (cancelBody.cancelled === true) {
    // キャンセルが成功した場合: WS の system exit イベントに cancelled=true が含まれる
    const exitEvent = messages.find(
      (m) => m.type === "system" && m.data === "Process exited",
    );
    assert.ok(exitEvent !== undefined, "Process exited イベントが届いていること");
    assert.equal(exitEvent.cancelled, true, "cancelled イベントには cancelled=true が含まれる");
  } else {
    // ジョブが先に完了した場合: 正常終了を確認
    assert.equal(cancelBody.cancelled, false);
    assert.ok(
      ["done", "error", "cancelled"].includes(cancelBody.status as string),
      "status は done/error/cancelled のいずれか",
    );
  }
});
