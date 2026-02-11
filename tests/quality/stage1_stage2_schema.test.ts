import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { validateAgainstSchema } from "../../src/quality/schema_validator.ts";

const sampleRunDir = path.resolve("projects/introducing-rescript/run-20260211-0000");

async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

test("stage1 blueprint sample matches schema", async () => {
  const blueprintPath = path.join(sampleRunDir, "stage1", "book_blueprint.json");
  const schemaPath = path.resolve("schemas/stage1.book-blueprint.schema.json");
  const data = await loadJson<unknown>(blueprintPath);

  await validateAgainstSchema(data, schemaPath);
});

test("stage2 variables samples match schema", async () => {
  const stage2Dir = path.join(sampleRunDir, "stage2");
  const schemaPath = path.resolve("schemas/stage2.episode-variables.schema.json");
  const files = (await readdir(stage2Dir))
    .filter((name) => /^E[0-9]{2}_variables\.json$/.test(name))
    .sort();

  assert.ok(files.length > 0);

  for (const fileName of files) {
    const filePath = path.join(stage2Dir, fileName);
    const data = await loadJson<unknown>(filePath);
    await validateAgainstSchema(data, schemaPath);
  }
});
