import { test } from "bun:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

interface ProjectConfig {
  STYLE_ID?: unknown;
}

test("all project configs reference existing style definitions", async () => {
  const projectsDir = path.resolve("configs/pipeline/projects");
  const stylesDir = path.resolve("configs/content/styles");
  const entries = (await readdir(projectsDir))
    .filter((name) => name.endsWith(".yaml"))
    .sort();

  for (const fileName of entries) {
    const configPath = path.join(projectsDir, fileName);
    const config = parseYaml(
      await readFile(configPath, "utf-8"),
    ) as ProjectConfig;

    assert.equal(
      typeof config.STYLE_ID,
      "string",
      `${fileName}: STYLE_ID must be a string`,
    );
    const styleId = String(config.STYLE_ID);
    const stylePath = path.join(stylesDir, `${styleId}.yaml`);

    await assert.doesNotReject(
      async () => stat(stylePath),
      `${fileName}: style definition not found for STYLE_ID="${styleId}" (${path.relative(
        process.cwd(),
        stylePath,
      )})`,
    );
  }
});
