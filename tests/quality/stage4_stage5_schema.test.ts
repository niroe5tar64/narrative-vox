import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { validateAgainstSchema } from "../../src/quality/schema_validator.ts";

const sampleRunDir = path.resolve("tests/fixtures/sample-run");

async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

test("stage4 voicevox_text samples match schema", async () => {
  const voicevoxTextDir = path.join(sampleRunDir, "voicevox_text");
  const schemaPath = path.resolve("schemas/stage4.voicevox-text.schema.json");
  const files = (await readdir(voicevoxTextDir))
    .filter((name) => /^E[0-9]{2}_voicevox_text\.json$/.test(name))
    .sort();

  assert.ok(files.length > 0);

  for (const fileName of files) {
    const filePath = path.join(voicevoxTextDir, fileName);
    const data = await loadJson<unknown>(filePath);
    await validateAgainstSchema(data, schemaPath);
  }
});

test("stage5 voicevox import samples match schema", async () => {
  const voicevoxProjectDir = path.join(sampleRunDir, "voicevox_project");
  const schemaPath = path.resolve("schemas/stage5.voicevox-import.schema.json");
  const files = (await readdir(voicevoxProjectDir))
    .filter((name) => /^E[0-9]{2}_voicevox_import\.json$/.test(name))
    .sort();

  assert.ok(files.length > 0);

  for (const fileName of files) {
    const filePath = path.join(voicevoxProjectDir, fileName);
    const data = await loadJson<unknown>(filePath);
    await validateAgainstSchema(data, schemaPath);
  }
});
