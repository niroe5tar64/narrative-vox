import { afterAll, beforeAll, test } from "bun:test";
import assert from "node:assert/strict";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import type {
  RunStatus,
  TreeNode,
  VoicevoxText,
} from "@narrative-vox/api-types";
import { app } from "../../../apps/api/src/app.ts";

const PROJECT_ID = `test-runs-happy-${crypto.randomUUID().slice(0, 8)}`;
const RUN_ID = "run-20260212-0101";
const FIXTURE_ROOT = path.join(process.cwd(), "tests/fixtures/sample-run");
const RUN_ROOT = path.join(process.cwd(), "data/projects", PROJECT_ID, RUN_ID);
const VOICEVOX_TEXT_REL_PATH = "voicevox_text/E01_voicevox_text.json";

async function apiFetch(
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  return app.fetch(new Request(`http://localhost${pathname}`, init));
}

function findChildDir(
  node: TreeNode,
  name: string,
): Extract<TreeNode, { type: "dir" }> | null {
  if (node.type !== "dir") return null;
  const child = node.children.find(
    (entry): entry is Extract<TreeNode, { type: "dir" }> =>
      entry.type === "dir" && entry.name === name,
  );
  return child ?? null;
}

function findChildFile(
  node: Extract<TreeNode, { type: "dir" }>,
  fileName: string,
): Extract<TreeNode, { type: "file" }> | null {
  const child = node.children.find(
    (entry): entry is Extract<TreeNode, { type: "file" }> =>
      entry.type === "file" && entry.name === fileName,
  );
  return child ?? null;
}

function fileApiPath(filePath: string): string {
  return `/api/runs/${PROJECT_ID}/${RUN_ID}/file?path=${encodeURIComponent(filePath)}`;
}

beforeAll(async () => {
  await cp(FIXTURE_ROOT, RUN_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(path.join(process.cwd(), "data/projects", PROJECT_ID), {
    recursive: true,
    force: true,
  });
});

test("run list: project filter 付きで fixture run を返す", async () => {
  const res = await apiFetch(
    `/api/runs?projectId=${PROJECT_ID}&page=1&pageSize=10`,
  );
  assert.equal(res.status, 200);

  const body = (await res.json()) as {
    items: Array<{ projectId: string; runId: string; createdAt: string }>;
    total: number;
    page: number;
    pageSize: number;
  };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0]?.projectId, PROJECT_ID);
  assert.equal(body.items[0]?.runId, RUN_ID);
  assert.equal(body.items[0]?.createdAt, "2026-02-12T01:01:00Z");
  assert.equal(body.total, 1);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 10);
});

test("run tree: fixture run の主要ディレクトリとファイルを返す", async () => {
  const res = await apiFetch(`/api/runs/${PROJECT_ID}/${RUN_ID}/tree`);
  assert.equal(res.status, 200);

  const body = (await res.json()) as { tree: TreeNode };
  assert.equal(body.tree.type, "dir");
  assert.equal(body.tree.name, RUN_ID);

  const scriptDir = findChildDir(body.tree, "script");
  const voicevoxTextDir = findChildDir(body.tree, "voicevox_text");
  const voicevoxProjectDir = findChildDir(body.tree, "voicevox_project");
  const blueprintDir = findChildDir(body.tree, "blueprint");
  const materialDir = findChildDir(body.tree, "material");

  assert.ok(blueprintDir, "blueprint directory should exist");
  assert.ok(materialDir, "material directory should exist");
  assert.ok(scriptDir, "script directory should exist");
  assert.ok(voicevoxTextDir, "voicevox_text directory should exist");
  assert.ok(voicevoxProjectDir, "voicevox_project directory should exist");

  assert.equal(
    findChildFile(scriptDir, "E01_script.md")?.path,
    "script/E01_script.md",
  );
  assert.equal(
    findChildFile(voicevoxTextDir, "E01_voicevox_text.json")?.path,
    "voicevox_text/E01_voicevox_text.json",
  );
  assert.equal(
    findChildFile(voicevoxProjectDir, "E01.vvproj")?.path,
    "voicevox_project/E01.vvproj",
  );
});

test("run status: fixture run の stage 状態を返す", async () => {
  const res = await apiFetch(`/api/runs/${PROJECT_ID}/${RUN_ID}/status`);
  assert.equal(res.status, 200);

  const body = (await res.json()) as RunStatus;
  assert.equal(body.projectId, PROJECT_ID);
  assert.equal(body.runId, RUN_ID);
  assert.equal(body.plannedEpisodeIds[0], "E01");
  assert.equal(body.plannedEpisodeIds.at(-1), "E12");
  assert.equal(body.plannedEpisodeIds.length, 12);
  assert.equal(body.stages.blueprint.status, "completed");
  assert.equal(body.stages.material.status, "partial");
  assert.equal(body.stages.script.status, "partial");
  assert.equal(body.stages.voicevox_text.status, "partial");
  assert.equal(body.stages.voicevox_project.status, "partial");
  assert.equal(body.stages.context.status, "idle");
  assert.equal(body.stages.audio.status, "idle");
});

test("run file: voicevox_text JSON を取得できる", async () => {
  const res = await apiFetch(fileApiPath(VOICEVOX_TEXT_REL_PATH));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json");

  const etag = res.headers.get("etag");
  assert.ok(etag, "ETag header should exist for voicevox_text");

  const body = (await res.json()) as VoicevoxText;
  assert.ok(Array.isArray(body.utterances));
  assert.equal(body.utterances[0]?.utterance_id, "U001");
});

test("run file save: valid If-Match で voicevox_text を更新できる", async () => {
  const getRes = await apiFetch(fileApiPath(VOICEVOX_TEXT_REL_PATH));
  assert.equal(getRes.status, 200);

  const currentEtag = getRes.headers.get("etag");
  assert.ok(currentEtag);
  const currentBody = (await getRes.json()) as VoicevoxText;

  const putRes = await apiFetch(fileApiPath(VOICEVOX_TEXT_REL_PATH), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": currentEtag,
    },
    body: JSON.stringify({
      utterances: [
        { utterance_id: "U001", text: "happy path updated" },
        { utterance_id: "U002", pause_length_ms: 999 },
      ],
    }),
  });
  assert.equal(putRes.status, 200);

  const newEtag = putRes.headers.get("etag");
  assert.ok(newEtag);
  assert.notEqual(newEtag, currentEtag);

  const updatedBody = (await putRes.json()) as VoicevoxText;
  const updatedU001 = updatedBody.utterances.find(
    (u) => u.utterance_id === "U001",
  );
  const updatedU002 = updatedBody.utterances.find(
    (u) => u.utterance_id === "U002",
  );
  const originalU001 = currentBody.utterances.find(
    (u) => u.utterance_id === "U001",
  );
  const originalU002 = currentBody.utterances.find(
    (u) => u.utterance_id === "U002",
  );

  assert.equal(updatedU001?.text, "happy path updated");
  assert.equal(updatedU001?.pause_length_ms, originalU001?.pause_length_ms);
  assert.equal(updatedU002?.pause_length_ms, 999);
  assert.equal(updatedU002?.text, originalU002?.text);

  const confirmRes = await apiFetch(fileApiPath(VOICEVOX_TEXT_REL_PATH));
  assert.equal(confirmRes.status, 200);
  const confirmBody = (await confirmRes.json()) as VoicevoxText;
  assert.equal(
    confirmBody.utterances.find((u) => u.utterance_id === "U001")?.text,
    "happy path updated",
  );
  assert.equal(
    confirmBody.utterances.find((u) => u.utterance_id === "U002")
      ?.pause_length_ms,
    999,
  );
});
