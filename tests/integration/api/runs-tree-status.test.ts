import { afterAll, beforeAll, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { TreeNode } from "@narrative-vox/api-types";
import { app } from "../../../apps/api/src/app.ts";

const PROJECT_ID = `test-runs-${crypto.randomUUID().slice(0, 8)}`;
const RUN_ID_DEEP = "run-20260101-0000";
const RUN_ID_STATUS_PARTIAL = "run-20260101-0001";
const RUN_ID_STATUS_COMPLETE = "run-20260101-0002";
const PROJECT_ROOT = path.join(process.cwd(), "data/projects", PROJECT_ID);

async function apiFetch(
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  return app.fetch(new Request(`http://localhost${pathname}`, init));
}

beforeAll(async () => {
  await mkdir(PROJECT_ROOT, { recursive: true });

  const deepRoot = path.join(PROJECT_ROOT, RUN_ID_DEEP);
  let current = deepRoot;
  for (let i = 0; i < 14; i += 1) {
    current = path.join(current, `d${String(i).padStart(2, "0")}`);
    await mkdir(current, { recursive: true });
  }
  await Bun.write(path.join(current, "leaf.txt"), "leaf\n");

  const partialRunRoot = path.join(PROJECT_ROOT, RUN_ID_STATUS_PARTIAL);
  await mkdir(path.join(partialRunRoot, "blueprint"), { recursive: true });
  await mkdir(path.join(partialRunRoot, "material"), { recursive: true });
  await Bun.write(
    path.join(partialRunRoot, "blueprint", "project_blueprint.json"),
    `${JSON.stringify(
      {
        episode_plan: [{ episode_id: "E01" }, { episode_id: "E02" }],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    path.join(partialRunRoot, "material", "E01_material.json"),
    "{}\n",
  );
  await Bun.write(
    path.join(partialRunRoot, "material", "E99_material.json"),
    "{}\n",
  );

  const completeRunRoot = path.join(PROJECT_ROOT, RUN_ID_STATUS_COMPLETE);
  await mkdir(path.join(completeRunRoot, "blueprint"), { recursive: true });
  await mkdir(path.join(completeRunRoot, "material"), { recursive: true });
  await Bun.write(
    path.join(completeRunRoot, "blueprint", "project_blueprint.json"),
    `${JSON.stringify(
      {
        episode_plan: [{ episode_id: "E01" }, { episode_id: "E02" }],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    path.join(completeRunRoot, "material", "E01_material.json"),
    "{}\n",
  );
  await Bun.write(
    path.join(completeRunRoot, "material", "E02_material.json"),
    "{}\n",
  );
  await Bun.write(
    path.join(completeRunRoot, "material", "E99_material.json"),
    "{}\n",
  );
});

afterAll(async () => {
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

function maxDepth(node: TreeNode): number {
  if (node.type === "file") return 0;
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map((child) => maxDepth(child)));
}

test("run tree: 深いディレクトリでも 200 で返る（深度制限あり）", async () => {
  const res = await apiFetch(`/api/runs/${PROJECT_ID}/${RUN_ID_DEEP}/tree`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { tree: TreeNode };
  const depth = maxDepth(body.tree);
  assert.ok(depth <= 11, `tree depth should be capped, actual=${depth}`);
});

test("run status: planned episode が欠けている場合は completed にならない", async () => {
  const res = await apiFetch(
    `/api/runs/${PROJECT_ID}/${RUN_ID_STATUS_PARTIAL}/status`,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    stages: { material: { status: string; episodeIds?: string[] } };
  };
  assert.equal(body.stages.material.status, "partial");
});

test("run status: planned episode を全て含む場合は completed になる", async () => {
  const res = await apiFetch(
    `/api/runs/${PROJECT_ID}/${RUN_ID_STATUS_COMPLETE}/status`,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    stages: { material: { status: string } };
  };
  assert.equal(body.stages.material.status, "completed");
});
