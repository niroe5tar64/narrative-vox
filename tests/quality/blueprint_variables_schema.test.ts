import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "bun:test";
import { validateAgainstSchema } from "../../src/quality/schema_validator.ts";

const sampleRunDir = path.resolve("tests/fixtures/sample-run");

async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

test("blueprint sample matches schema", async () => {
  const blueprintPath = path.join(sampleRunDir, "blueprint", "book_blueprint.json");
  const schemaPath = path.resolve("schemas/blueprint.schema.json");
  const data = await loadJson<unknown>(blueprintPath);

  await validateAgainstSchema(data, schemaPath);
});

test("variables samples match schema", async () => {
  const variablesDir = path.join(sampleRunDir, "variables");
  const schemaPath = path.resolve("schemas/episode-variables.schema.json");
  const files = (await readdir(variablesDir))
    .filter((name) => /^E[0-9]{2}_variables\.json$/.test(name))
    .sort();

  assert.ok(files.length > 0);

  for (const fileName of files) {
    const filePath = path.join(variablesDir, fileName);
    const data = await loadJson<unknown>(filePath);
    await validateAgainstSchema(data, schemaPath);
  }
});
