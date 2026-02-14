import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";
import { checkRun } from "../../src/quality/check_run.ts";

const sampleRunDir = path.resolve("tests/fixtures/sample-run");

function buildScriptFromSectionOrder(sectionOrder: number[]): string {
  const sectionTitles: Record<number, string> = {
    1: "オープニング",
    2: "前提を呼び起こす",
    3: "結論を先に提示",
    4: "概念の最小モデル説明",
    5: "構造の捉え方",
    6: "思考を促す問いかけ",
    7: "実務への接続",
    8: "まとめ"
  };
  const lines: string[] = [];
  for (const sectionId of sectionOrder) {
    const title = sectionTitles[sectionId] ?? `セクション${sectionId}`;
    lines.push(`${sectionId}. ${title}`);
    lines.push(`${title}です。`);
  }
  lines.push("合計想定時間: 10分");
  return lines.join("\n");
}

function buildValidScript(): string {
  return buildScriptFromSectionOrder([1, 2, 3, 4, 5, 6, 7, 8]);
}

function buildValidScriptWithMarkdownHeadings(): string {
  return [
    "## 1. オープニング",
    "導入です。",
    "## 2. 前提を呼び起こす",
    "前提です。",
    "## 3. 結論を先に提示",
    "結論です。",
    "## 4. 概念の最小モデル説明",
    "説明です。",
    "## 5. 構造の捉え方",
    "整理します。",
    "## 6. 思考を促す問いかけ",
    "問いです。",
    "## 7. 実務への接続",
    "接続です。",
    "## 8. まとめ",
    "まとめです。",
    "合計想定時間: 10分"
  ].join("\n");
}

function buildValidScriptWithDurationSuffixes(): string {
  const base = buildValidScript();
  const lines = base.split("\n");
  const withDurationLines: string[] = [];

  for (const line of lines) {
    withDurationLines.push(line);
    if (/^\d\.\s+/.test(line)) {
      continue;
    }
    if (/です。$/.test(line)) {
      withDurationLines.push("(想定: 1分)");
    }
  }

  return withDurationLines.join("\n");
}

async function prepareMinimalRun(
  stage2EpisodeIds: string[],
  stage3Scripts: Record<string, string>
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-stage123-"));
  const runDir = path.join(tempRoot, "projects", "book", "run-20260211-9999");

  const stage1Dir = path.join(runDir, "stage1");
  const stage2Dir = path.join(runDir, "stage2");
  const stage3Dir = path.join(runDir, "stage3");
  await mkdir(stage1Dir, { recursive: true });
  await mkdir(stage2Dir, { recursive: true });
  await mkdir(stage3Dir, { recursive: true });

  const stage1Raw = await readFile(path.join(sampleRunDir, "stage1", "book_blueprint.json"), "utf-8");
  await writeFile(path.join(stage1Dir, "book_blueprint.json"), stage1Raw, "utf-8");

  const stage2Template = JSON.parse(
    await readFile(path.join(sampleRunDir, "stage2", "E01_variables.json"), "utf-8")
  ) as {
    meta: { episode_id: string };
  };
  for (const episodeId of stage2EpisodeIds) {
    const data = {
      ...stage2Template,
      meta: {
        ...stage2Template.meta,
        episode_id: episodeId
      }
    };
    await writeFile(
      path.join(stage2Dir, `${episodeId}_variables.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8"
    );
  }

  for (const [episodeId, scriptText] of Object.entries(stage3Scripts)) {
    await writeFile(path.join(stage3Dir, `${episodeId}_script.md`), scriptText, "utf-8");
  }

  return runDir;
}

test("checkRun accepts current sample run", async () => {
  const result = await checkRun({
    runDir: sampleRunDir
  });

  assert.equal(result.stage2EpisodeCount > 0, true);
  assert.equal(result.stage2EpisodeCount, result.stage3EpisodeCount);
  assert.equal(result.validatedEpisodeIds[0], "E01");
});

test('checkRun rejects stage3 script without "合計想定時間:"', async () => {
  const invalidScript = buildValidScript()
    .split("\n")
    .filter((line) => !line.startsWith("合計想定時間:"))
    .join("\n");
  const runDir = await prepareMinimalRun(["E01"], { E01: invalidScript });

  await assert.rejects(
    () => checkRun({ runDir }),
    /missing "合計想定時間:" line/
  );
});

test("checkRun rejects episode mismatch between stage2 and stage3", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
    E02: buildValidScript()
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /stage3 has episodes not in stage2 variables: E02/
  );
});

test("checkRun rejects stage3 script with section order violation", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildScriptFromSectionOrder([1, 2, 4, 3, 5, 6, 7, 8])
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /episode: E01[\s\S]*section order violation[\s\S]*1, 2, 4, 3, 5, 6, 7, 8/
  );
});

test("checkRun rejects stage3 script with duplicate section ID", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildScriptFromSectionOrder([1, 2, 2, 3, 4, 5, 6, 7, 8])
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /episode: E01[\s\S]*duplicate section IDs: 2/
  );
});

test("checkRun accepts markdown heading style section lines", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScriptWithMarkdownHeadings()
  });

  const result = await checkRun({ runDir });
  assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
});

test("checkRun accepts scripts that still include legacy section duration notes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScriptWithDurationSuffixes()
  });

  const result = await checkRun({ runDir });
  assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
});
