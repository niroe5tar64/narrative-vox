import { test } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { MorphTokenizer } from "@narrative-vox/infrastructure/japanese-morph-tokenizer.ts";
import { checkRun } from "@narrative-vox/quality/check-run.ts";

const sampleRunDir = path.resolve("tests/fixtures/sample-run");
const ENGINE_ID = "074fc39e-678b-4c13-8916-ffca8d505d1d";
const SPEAKER_ID = "04dbd989-32d0-40b4-9e71-17c920f2a8a9";
const STYLE_ID = 67;

async function withMockVoicevoxServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve mock VOICEVOX server address");
    }
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function buildValidScript(): string {
  return [
    "## 1. オープニング",
    "[speaker:teacher] 導入です。",
    "## 2. 前提を呼び起こす",
    "[speaker:student] 前提です。",
    "## 3. 結論を先に提示",
    "[speaker:teacher] 結論です。",
  ].join("\n");
}

function buildScriptWithManySections(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const speakerKey = i % 2 === 0 ? "student" : "teacher";
    lines.push(`## ${i}. セクション${i}`);
    lines.push(`[speaker:${speakerKey}] セクション${i}の内容です。`);
  }
  return lines.join("\n");
}

interface MockMorphToken {
  surface_form: string;
  word_position: number;
}

function buildMockMorphTokens(text: string, surfaces: string[]): MockMorphToken[] {
  const tokens: MockMorphToken[] = [];
  let cursor = 0;
  for (const surface of surfaces) {
    const index = text.indexOf(surface, cursor);
    if (index < 0) {
      throw new Error(
        `Failed to build mock morph token. surface="${surface}" not found in "${text}" from ${cursor}`,
      );
    }
    tokens.push({
      surface_form: surface,
      word_position: index + 1,
    });
    cursor = index + surface.length;
  }
  return tokens;
}

function createMockMorphTokenizer(
  tokensByText: Record<string, string[]>,
): MorphTokenizer {
  return {
    tokenize: (text: string) =>
      buildMockMorphTokens(text, tokensByText[text] ?? []),
  } as unknown as MorphTokenizer;
}

const sampleMaterial = {
  schema_version: "1.0",
  meta: {
    project_id: "introducing-rescript",
    episode_id: "E01",
    episode_title: "テスト",
    genre: "tech_explainer",
    audience: {
      background: "テスト",
      level: "テスト",
      interest: "テスト",
    },
  },
  sections: [
    {
      section_id: "S01",
      section: "テスト1",
      goal: "テスト",
      elements: [
        {
          element_id: "EL001",
          type: "theme_introduction",
          content: "テスト",
          importance: "must",
        },
      ],
    },
    {
      section_id: "S02",
      section: "テスト2",
      goal: "テスト",
      elements: [
        {
          element_id: "EL002",
          type: "concept",
          content: "テスト",
          importance: "must",
        },
      ],
    },
    {
      section_id: "S03",
      section: "テスト3",
      goal: "テスト",
      elements: [
        {
          element_id: "EL003",
          type: "takeaway",
          content: "テスト",
          importance: "must",
        },
      ],
    },
  ],
  quality_checks: {
    source_coverage: "OK",
    element_dependency_valid: "OK",
    importance_distribution: { must: 3, should: 0, optional: 0 },
  },
};

async function prepareMinimalRun(
  materialEpisodeIds: string[],
  scriptScripts: Record<string, string>,
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-run-"));
  const runDir = path.join(tempRoot, "projects", "book", "run-20260211-9999");

  const blueprintDir = path.join(runDir, "blueprint");
  const materialDir = path.join(runDir, "material");
  const scriptDir = path.join(runDir, "script");
  await mkdir(blueprintDir, { recursive: true });
  await mkdir(materialDir, { recursive: true });
  await mkdir(scriptDir, { recursive: true });

  const blueprintRaw = await readFile(
    path.join(sampleRunDir, "blueprint", "project_blueprint.json"),
    "utf-8",
  );
  await writeFile(
    path.join(blueprintDir, "project_blueprint.json"),
    blueprintRaw,
    "utf-8",
  );

  for (const episodeId of materialEpisodeIds) {
    const data = {
      ...sampleMaterial,
      meta: {
        ...sampleMaterial.meta,
        episode_id: episodeId,
      },
    };
    await writeFile(
      path.join(materialDir, `${episodeId}_material.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8",
    );
  }

  for (const [episodeId, scriptText] of Object.entries(scriptScripts)) {
    await writeFile(
      path.join(scriptDir, `${episodeId}_script.md`),
      scriptText,
      "utf-8",
    );
  }

  return runDir;
}

async function updateMaterialFiles(
  runDir: string,
  updater: (
    data: Record<string, unknown>,
    context: { fileName: string; episodeId: string },
  ) => Record<string, unknown>,
): Promise<void> {
  const materialDir = path.join(runDir, "material");
  const materialFiles = (await readdir(materialDir))
    .filter((name) => name.endsWith("_material.json"))
    .sort();

  for (const fileName of materialFiles) {
    const episodeId = fileName.replace("_material.json", "");
    const filePath = path.join(materialDir, fileName);
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const updated = updater(parsed, { fileName, episodeId });
    await writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  }
}

async function updateBlueprintEpisodePlan(
  runDir: string,
  updater: (
    episodePlan: Array<Record<string, unknown>>,
  ) => Array<Record<string, unknown>>,
): Promise<void> {
  const blueprintPath = path.join(
    runDir,
    "blueprint",
    "project_blueprint.json",
  );
  const raw = await readFile(blueprintPath, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const episodePlan = parsed.episode_plan;
  if (!Array.isArray(episodePlan)) {
    throw new Error("blueprint.episode_plan must be an array");
  }
  parsed.episode_plan = updater(episodePlan as Array<Record<string, unknown>>);
  await writeFile(
    blueprintPath,
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf-8",
  );
}

test("checkRun accepts current sample run", async () => {
  await withMockVoicevoxServer(
    (req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && requestUrl.pathname === "/version") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('"0.25.1"');
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    },
    async (voicevoxApiUrl) => {
      const result = await checkRun({
        runDir: sampleRunDir,
        engineId: ENGINE_ID,
        speakerId: SPEAKER_ID,
        styleId: STYLE_ID,
        synthesisDefaultsPath: path.resolve(
          "configs/voice/voicevox/synthesis-defaults.example.json",
        ),
        voicevoxApiUrl,
      });

      assert.equal(result.materialEpisodeCount > 0, true);
      assert.equal(result.materialEpisodeCount, result.scriptEpisodeCount);
      assert.equal(result.validatedEpisodeIds[0], "E01");
    },
  );
});

test("checkRun accepts script with any number of sections", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildScriptWithManySections(),
  });
  await withMockVoicevoxServer(
    (req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && requestUrl.pathname === "/version") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('"0.25.1"');
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    },
    async (voicevoxApiUrl) => {
      const result = await checkRun({
        runDir,
        engineId: ENGINE_ID,
        speakerId: SPEAKER_ID,
        styleId: STYLE_ID,
        synthesisDefaultsPath: path.resolve(
          "configs/voice/voicevox/synthesis-defaults.example.json",
        ),
        voicevoxApiUrl,
      });
      assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
    },
  );
});

test("checkRun rejects episode mismatch between material and script", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
    E02: buildValidScript(),
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /script has episodes not in material: E02/,
  );
});

test("checkRun rejects empty script", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: "",
  });

  await assert.rejects(() => checkRun({ runDir }), /is empty/);
});

test("checkRun rejects script without section headings", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: "導入です。\n結論です。",
  });

  await assert.rejects(() => checkRun({ runDir }), /has no section headings/);
});

test("checkRun accepts script with markdown heading style section lines", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
  });

  await withMockVoicevoxServer(
    (req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && requestUrl.pathname === "/version") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('"0.25.1"');
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    },
    async (voicevoxApiUrl) => {
      const result = await checkRun({
        runDir,
        engineId: ENGINE_ID,
        speakerId: SPEAKER_ID,
        styleId: STYLE_ID,
        synthesisDefaultsPath: path.resolve(
          "configs/voice/voicevox/synthesis-defaults.example.json",
        ),
        voicevoxApiUrl,
      });
      assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
    },
  );
});

test("checkRun rejects dialogue script lines without speaker tags", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] 導入です。",
      "## 2. 前提を呼び起こす",
      "この行はspeakerタグがありません。",
    ].join("\n"),
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /requires \[speaker:<key>\] at line start/,
  );
});

test("checkRun rejects invalid speaker tag format", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:Teacher] 導入です。",
      "## 2. 前提を呼び起こす",
      "[speaker:student] 前提です。",
    ].join("\n"),
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /invalid \[speaker:<key>\] format/,
  );
});

test("checkRun rejects speaker_count mismatch for dialogue style", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] 導入です。",
      "## 2. 前提を呼び起こす",
      "[speaker:teacher] 前提です。",
      "## 3. 結論を先に提示",
      "[speaker:teacher] 結論です。",
    ].join("\n"),
  });

  await assert.rejects(() => checkRun({ runDir }), /requires speaker_count=2/);
});

test("checkRun rejects speaker_count mismatch for monologue style", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const projectId = `tmp-project-${randomUUID()}`;
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );

  const baseConfig = JSON.parse(
    await readFile(
      path.resolve("configs/pipeline/projects/introducing-rescript.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;
  const tempConfig = {
    ...baseConfig,
    PROJECT_ID: projectId,
    STYLE_ID: "lecture",
  };

  await writeFile(
    projectConfigPath,
    `${JSON.stringify(tempConfig, null, 2)}\n`,
    "utf-8",
  );

  try {
    await updateMaterialFiles(runDir, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        ...data,
        meta: {
          ...meta,
          project_id: projectId,
        },
      };
    });

    await assert.rejects(
      () => checkRun({ runDir }),
      /requires speaker_count=1/,
    );
  } finally {
    await rm(projectConfigPath, { force: true });
  }
});

test("checkRun accepts monologue style with one speaker key", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] 導入です。",
      "## 2. 前提を呼び起こす",
      "[speaker:teacher] 前提です。",
      "## 3. 結論を先に提示",
      "[speaker:teacher] 結論です。",
    ].join("\n"),
  });
  const projectId = `tmp-project-${randomUUID()}`;
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );

  const baseConfig = JSON.parse(
    await readFile(
      path.resolve("configs/pipeline/projects/introducing-rescript.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;
  const tempConfig = {
    ...baseConfig,
    PROJECT_ID: projectId,
    STYLE_ID: "lecture",
  };

  await writeFile(
    projectConfigPath,
    `${JSON.stringify(tempConfig, null, 2)}\n`,
    "utf-8",
  );

  try {
    await updateMaterialFiles(runDir, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        ...data,
        meta: {
          ...meta,
          project_id: projectId,
        },
      };
    });

    await withMockVoicevoxServer(
      (req, res) => {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "GET" && requestUrl.pathname === "/version") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end('"0.25.1"');
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
      },
      async (voicevoxApiUrl) => {
        const result = await checkRun({
          runDir,
          synthesisDefaultsPath: path.resolve(
            "configs/voice/voicevox/synthesis-defaults.example.json",
          ),
          voicevoxApiUrl,
        });
        assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
      },
    );
  } finally {
    await rm(projectConfigPath, { force: true });
  }
});

test("checkRun rejects self-referenced prerequisite_episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E01") {
        return {
          ...episode,
          prerequisite_episodes: ["E01"],
        };
      }
      return episode;
    }),
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /cannot list itself in prerequisite_episodes/,
  );
});

test("checkRun rejects duplicate prerequisite_episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E02") {
        return {
          ...episode,
          prerequisite_episodes: ["E01", "E01"],
        };
      }
      return episode;
    }),
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /has duplicate prerequisite_episodes: E01/,
  );
});

test("checkRun rejects prerequisite_episodes that reference missing episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E01") {
        return {
          ...episode,
          prerequisite_episodes: ["E99"],
        };
      }
      return episode;
    }),
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /references missing prerequisite_episodes: E99/,
  );
});

test("checkRun rejects cyclic prerequisite_episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E01") {
        return {
          ...episode,
          prerequisite_episodes: ["E02"],
        };
      }
      if (episode.episode_id === "E02") {
        return {
          ...episode,
          prerequisite_episodes: ["E01"],
        };
      }
      return episode;
    }),
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /prerequisite_episodes has a cycle: E01 -> E02 -> E01|prerequisite_episodes has a cycle: E02 -> E01 -> E02/,
  );
});

test("checkRun rejects inconsistent project_id across material files", async () => {
  const runDir = await prepareMinimalRun(["E01", "E02"], {
    E01: buildValidScript(),
    E02: buildValidScript(),
  });

  await updateMaterialFiles(runDir, (data, context) => {
    if (context.episodeId !== "E02") {
      return data;
    }
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    return {
      ...data,
      meta: {
        ...meta,
        project_id: "kuromoji",
      },
    };
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /has inconsistent project_id values:/,
  );
});

test("checkRun rejects missing project config for material project_id", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const missingProjectId = `missing-project-${randomUUID()}`;

  await updateMaterialFiles(runDir, (data) => {
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    return {
      ...data,
      meta: {
        ...meta,
        project_id: missingProjectId,
      },
    };
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    new RegExp(`Project config not found for project_id "${missingProjectId}"`),
  );
});

test("checkRun rejects schema-invalid project config", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const projectId = `tmp-project-${randomUUID()}`;
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );

  await writeFile(
    projectConfigPath,
    `${JSON.stringify(
      {
        PROJECT_ID: projectId,
        STYLE_ID: "radio-talk",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  try {
    await updateMaterialFiles(runDir, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        ...data,
        meta: {
          ...meta,
          project_id: projectId,
        },
      };
    });

    await assert.rejects(
      () => checkRun({ runDir }),
      /Schema validation failed \(project-config\.schema\.json\)/,
    );
  } finally {
    await rm(projectConfigPath, { force: true });
  }
});

test("checkRun rejects missing style definition referenced by STYLE_ID", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const projectId = `tmp-project-${randomUUID()}`;
  const missingStyleId = `tmp-style-missing-${randomUUID()}`;
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );

  const baseConfig = JSON.parse(
    await readFile(
      path.resolve("configs/pipeline/projects/introducing-rescript.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;
  const tempConfig = {
    ...baseConfig,
    PROJECT_ID: projectId,
    STYLE_ID: missingStyleId,
  };

  await writeFile(
    projectConfigPath,
    `${JSON.stringify(tempConfig, null, 2)}\n`,
    "utf-8",
  );

  try {
    await updateMaterialFiles(runDir, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        ...data,
        meta: {
          ...meta,
          project_id: projectId,
        },
      };
    });

    await assert.rejects(
      () => checkRun({ runDir }),
      new RegExp(`Style definition not found for STYLE_ID "${missingStyleId}"`),
    );
  } finally {
    await rm(projectConfigPath, { force: true });
  }
});

test("checkRun rejects schema-invalid content style", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const projectId = `tmp-project-${randomUUID()}`;
  const styleId = `tmp-style-${randomUUID()}`;
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  const stylePath = path.resolve(
    "configs",
    "content",
    "styles",
    `${styleId}.json`,
  );

  const baseConfig = JSON.parse(
    await readFile(
      path.resolve("configs/pipeline/projects/introducing-rescript.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;
  const tempConfig = {
    ...baseConfig,
    PROJECT_ID: projectId,
    STYLE_ID: styleId,
  };

  await writeFile(
    projectConfigPath,
    `${JSON.stringify(tempConfig, null, 2)}\n`,
    "utf-8",
  );
  await writeFile(
    stylePath,
    `${JSON.stringify({ style_id: styleId }, null, 2)}\n`,
    "utf-8",
  );

  try {
    await updateMaterialFiles(runDir, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        ...data,
        meta: {
          ...meta,
          project_id: projectId,
        },
      };
    });

    await assert.rejects(
      () => checkRun({ runDir }),
      /Schema validation failed \(content-style\.schema\.json\)/,
    );
  } finally {
    await rm(projectConfigPath, { force: true });
    await rm(stylePath, { force: true });
  }
});

test("checkRun rejects STYLE_ID and content-style style_id mismatch", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const projectId = `tmp-project-${randomUUID()}`;
  const styleId = `tmp-style-${randomUUID()}`;
  const differentStyleId = `different-style-${randomUUID()}`;
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  const stylePath = path.resolve(
    "configs",
    "content",
    "styles",
    `${styleId}.json`,
  );

  const baseConfig = JSON.parse(
    await readFile(
      path.resolve("configs/pipeline/projects/introducing-rescript.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;
  const baseStyle = JSON.parse(
    await readFile(
      path.resolve("configs/content/styles/radio-talk.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;

  const tempConfig = {
    ...baseConfig,
    PROJECT_ID: projectId,
    STYLE_ID: styleId,
  };
  const tempStyle = {
    ...baseStyle,
    style_id: differentStyleId,
  };

  await writeFile(
    projectConfigPath,
    `${JSON.stringify(tempConfig, null, 2)}\n`,
    "utf-8",
  );
  await writeFile(
    stylePath,
    `${JSON.stringify(tempStyle, null, 2)}\n`,
    "utf-8",
  );

  try {
    await updateMaterialFiles(runDir, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        ...data,
        meta: {
          ...meta,
          project_id: projectId,
        },
      };
    });

    await assert.rejects(
      () => checkRun({ runDir }),
      new RegExp(
        `style_id "${differentStyleId}" does not match STYLE_ID "${styleId}"`,
      ),
    );
  } finally {
    await rm(projectConfigPath, { force: true });
    await rm(stylePath, { force: true });
  }
});

// --- Commit A: RunContract Step 0 tests ---

test("checkRun warns when run-contract.json is missing", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  // No run-contract.json written — should still succeed with a warning
  const result = await checkRun({ runDir });
  assert.ok(
    result.warnings.some((w) => w.includes("run-contract.json not found")),
    `Expected warning about missing run-contract.json, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun succeeds without warning when run-contract.json is valid", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const runId = "run-20260211-9999";
  const runContract = {
    version: 1,
    projectId: "introducing-rescript",
    runId,
    runDir,
    createdAt: "2026-02-11T99:00:00.000Z",
  };
  // Fix: use a valid date-time
  runContract.createdAt = "2026-02-11T09:00:00.000Z";
  await writeFile(
    path.join(runDir, "run-contract.json"),
    `${JSON.stringify(runContract, null, 2)}\n`,
    "utf-8",
  );
  const result = await checkRun({ runDir });
  assert.ok(
    !result.warnings.some((w) => w.includes("run-contract.json")),
    `Unexpected warning about run-contract.json: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun throws when run-contract.json fails schema validation", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  // Write a schema-invalid run-contract (missing required fields)
  await writeFile(
    path.join(runDir, "run-contract.json"),
    `${JSON.stringify({ invalid: true }, null, 2)}\n`,
    "utf-8",
  );
  await assert.rejects(
    () => checkRun({ runDir }),
    /Schema validation failed \(run-contract\.schema\.json\)/,
  );
});

// --- Commit B: panel mode speaker_mode tests ---

const PANEL_STYLE_ID = `tmp-panel-style-${randomUUID()}`;
const PANEL_PROJECT_ID = `tmp-panel-project-${randomUUID()}`;
const panelProjectConfigPath = path.resolve(
  "configs",
  "pipeline",
  "projects",
  `${PANEL_PROJECT_ID}.json`,
);
const panelStylePath = path.resolve(
  "configs",
  "content",
  "styles",
  `${PANEL_STYLE_ID}.json`,
);

async function preparePanelStyleRun(
  scriptText: string,
): Promise<{ runDir: string; cleanup: () => Promise<void> }> {
  const baseConfig = JSON.parse(
    await readFile(
      path.resolve("configs/pipeline/projects/introducing-rescript.json"),
      "utf-8",
    ),
  ) as Record<string, unknown>;
  const panelProjectConfig = {
    ...baseConfig,
    PROJECT_ID: PANEL_PROJECT_ID,
    STYLE_ID: PANEL_STYLE_ID,
  };
  const panelStyle = {
    style_id: PANEL_STYLE_ID,
    style_name: "パネル形式",
    description: "複数人のパネルディスカッション形式",
    format: {
      speaker_mode: "panel",
      speaker_count: 3,
      speaker_roles: [
        { role: "lead", utterance_share: 0.4 },
        { role: "questioner", utterance_share: 0.3 },
        { role: "commentator", utterance_share: 0.3 },
      ],
    },
    pacing: {
      target_duration_minutes: { min: 15, max: 20 },
      utterance_length: { target_chars: 100, max_chars: 200 },
      section_transition_style: "verbal_bridge",
      pause_between_sections_ms: 800,
      reflection_pause_ms: 3000,
    },
    language: {
      formality: "polite",
      sentence_endings: "mixed",
      technical_term_treatment: "define_on_first_use",
      code_verbalization: "structure_then_meaning",
    },
    segment_structure: {
      chat_content_ratio: 0.1,
      opening_style: "casual_greeting",
      closing_style: "preview_next",
      allow_tangent: false,
      repetition_strategy: "key_points_repeated",
    },
    interaction: {
      question_frequency: "per_section",
      listener_address: "occasional",
      reaction_utterances: true,
    },
    content_treatment: {
      analogy_usage: "per_concept",
      example_density: "moderate",
      humor_level: "light",
      emphasis_technique: "question_answer",
    },
  };

  await writeFile(
    panelProjectConfigPath,
    `${JSON.stringify(panelProjectConfig, null, 2)}\n`,
    "utf-8",
  );
  await writeFile(
    panelStylePath,
    `${JSON.stringify(panelStyle, null, 2)}\n`,
    "utf-8",
  );

  const runDir = await prepareMinimalRun(["E01"], { E01: scriptText });
  await updateMaterialFiles(runDir, (data) => {
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    return { ...data, meta: { ...meta, project_id: PANEL_PROJECT_ID } };
  });

  const cleanup = async () => {
    await rm(panelProjectConfigPath, { force: true });
    await rm(panelStylePath, { force: true });
  };

  return { runDir, cleanup };
}

function buildPanelScript(speakerKeys: string[]): string {
  const lines: string[] = ["## 1. オープニング"];
  for (const [i, key] of speakerKeys.entries()) {
    lines.push(`[speaker:${key}] 発言${i + 1}です。`);
  }
  return lines.join("\n");
}

test("checkRun accepts panel mode with 2 speakers (below speaker_count=3)", async () => {
  const { runDir, cleanup } = await preparePanelStyleRun(
    buildPanelScript(["teacher", "student"]),
  );
  try {
    const result = await checkRun({ runDir });
    assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
  } finally {
    await cleanup();
  }
});

test("checkRun accepts panel mode with exactly speaker_count=3 speakers", async () => {
  const { runDir, cleanup } = await preparePanelStyleRun(
    buildPanelScript(["teacher", "student", "narrator"]),
  );
  try {
    const result = await checkRun({ runDir });
    assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
  } finally {
    await cleanup();
  }
});

test("checkRun rejects panel mode with 4 speakers (exceeds speaker_count=3)", async () => {
  // Use 4 speaker keys — error happens at Step 3 before character map check
  const { runDir, cleanup } = await preparePanelStyleRun(
    buildPanelScript(["teacher", "student", "narrator", "extra"]),
  );
  try {
    await assert.rejects(
      () => checkRun({ runDir }),
      /requires 2\.\.3 speakers for panel mode/,
    );
  } finally {
    await cleanup();
  }
});

test("checkRun rejects panel mode with 1 speaker (below minimum)", async () => {
  const { runDir, cleanup } = await preparePanelStyleRun(
    buildPanelScript(["teacher"]),
  );
  try {
    await assert.rejects(
      () => checkRun({ runDir }),
      /requires 2\.\.3 speakers for panel mode/,
    );
  } finally {
    await cleanup();
  }
});

// --- Commit C: Layer 2 warn-only validation tests ---

const validVoicevoxText = {
  schema_version: "1.0",
  meta: {
    project_id: "introducing-rescript",
    run_id: "run-20260211-9999",
    episode_id: "E01",
    source_script_path: "script/E01_script.md",
    generated_at: "2026-02-11T09:00:00.000Z",
  },
  utterances: [
    {
      utterance_id: "U001",
      section_id: 1,
      section_title: "オープニング",
      text: "テストです。",
      pause_length_ms: 500,
    },
  ],
  dictionary_candidates: [],
  quality_checks: {
    utterance_count: 1,
    max_chars_per_utterance: 6,
    has_ruby_notation: false,
    speakability: {
      score: 90,
      average_chars_per_utterance: 6,
      long_utterance_ratio: 0,
      terminal_punctuation_ratio: 1,
    },
    warnings: [],
  },
};

const validVoicevoxProjectMeta = {
  generated_at: "2026-02-11T09:00:00.000Z",
  adjustments: {
    speed_preset: "normal",
  },
};

test("checkRun skips Layer 2 validation when voicevox_text dir is absent", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  // No voicevox_text dir — should succeed without additional warnings about it
  const result = await checkRun({ runDir });
  assert.ok(
    !result.warnings.some((w) => w.includes("voicevox_text")),
    `Unexpected voicevox_text warning: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun adds no warning for valid voicevox_text JSON", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const voicevoxTextDir = path.join(runDir, "voicevox_text");
  await mkdir(voicevoxTextDir, { recursive: true });
  await writeFile(
    path.join(voicevoxTextDir, "E01_voicevox_text.json"),
    `${JSON.stringify(validVoicevoxText, null, 2)}\n`,
    "utf-8",
  );
  const result = await checkRun({ runDir });
  assert.ok(
    !result.warnings.some((w) => w.includes("voicevox_text")),
    `Unexpected voicevox_text warning: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun warns (not throws) for schema-invalid voicevox_text JSON", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const voicevoxTextDir = path.join(runDir, "voicevox_text");
  await mkdir(voicevoxTextDir, { recursive: true });
  await writeFile(
    path.join(voicevoxTextDir, "E01_voicevox_text.json"),
    `${JSON.stringify({ invalid: true }, null, 2)}\n`,
    "utf-8",
  );
  // Should not throw
  const result = await checkRun({ runDir });
  assert.ok(
    result.warnings.some(
      (w) =>
        w.includes("voicevox_text/E01_voicevox_text.json") &&
        w.includes("schema validation failed"),
    ),
    `Expected voicevox_text schema warning, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun adds no warning for valid voicevox_project_meta JSON", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const voicevoxProjectDir = path.join(runDir, "voicevox_project");
  await mkdir(voicevoxProjectDir, { recursive: true });
  await writeFile(
    path.join(voicevoxProjectDir, "E01_voicevox_project_meta.json"),
    `${JSON.stringify(validVoicevoxProjectMeta, null, 2)}\n`,
    "utf-8",
  );
  const result = await checkRun({ runDir });
  assert.ok(
    !result.warnings.some((w) => w.includes("voicevox_project")),
    `Unexpected voicevox_project warning: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun warns (not throws) for schema-invalid voicevox_project_meta JSON", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
  const voicevoxProjectDir = path.join(runDir, "voicevox_project");
  await mkdir(voicevoxProjectDir, { recursive: true });
  await writeFile(
    path.join(voicevoxProjectDir, "E01_voicevox_project_meta.json"),
    `${JSON.stringify({ extra_field: "not_allowed" }, null, 2)}\n`,
    "utf-8",
  );
  // Should not throw
  const result = await checkRun({ runDir });
  assert.ok(
    result.warnings.some(
      (w) =>
        w.includes("voicevox_project/E01_voicevox_project_meta.json") &&
        w.includes("schema validation failed"),
    ),
    `Expected voicevox_project schema warning, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun writes technical_terms audit report under context/", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] TypeScript と AST の違いを確認します。",
      "## 2. 本編",
      "[speaker:student] TypeScript と AST を比較します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "TypeScript", note: "表記ゆれ監査対象" },
      { term: "AST", note: "高リスク略語" },
    ],
  }));

  const voicevoxTextDir = path.join(runDir, "voicevox_text");
  await mkdir(voicevoxTextDir, { recursive: true });
  await writeFile(
    path.join(voicevoxTextDir, "E01_voicevox_text.json"),
    `${JSON.stringify(
      {
        ...validVoicevoxText,
        dictionary_candidates: [
          {
            surface: "TypeScript",
            reading_or_empty: "タイプスクリプト",
            priority: "HIGH",
            occurrences: 2,
            source: "token",
          },
          {
            surface: "AST",
            reading_or_empty: "エーエスティー",
            priority: "HIGH",
            occurrences: 1,
            source: "token",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  const result = await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(
    await readFile(reportPath, "utf-8"),
  ) as {
    summary: { total_terms: number; covered_terms: number };
    details: { missing_in_script: string[]; missing_in_dictionary_candidates: string[] };
  };

  assert.equal(report.summary.total_terms, 2);
  assert.equal(report.summary.covered_terms, 2);
  assert.deepEqual(report.details.missing_in_script, []);
  assert.deepEqual(report.details.missing_in_dictionary_candidates, []);
  assert.ok(
    !result.warnings.some((warning) =>
      warning.includes("technical_terms audit report written to context/E01_technical_terms_audit.json"),
    ),
    `Expected no report-written warning when audit has no warnings, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun warns when technical_terms dictionary audit is skipped", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] API 設計を確認します。",
      "## 2. 本編",
      "[speaker:student] API の使い方を確認します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "API", note: "略語" }],
  }));

  const result = await checkRun({ runDir });
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("dictionary_candidates audit skipped"),
    ),
    `Expected dictionary audit skipped warning, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun warns on notation inconsistencies and unresolved high-risk terms", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] TypeScript と Type-Script の表記が混在しています。",
      "## 2. 本編",
      "[speaker:student] API も登場します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "TypeScript", note: "表記ゆれ確認" },
      { term: "API", note: "未解決略語" },
    ],
  }));

  const result = await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: {
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };

  assert.deepEqual(report.details.notation_inconsistencies, [
    { term: "TypeScript", variants: ["Type-Script", "TypeScript"] },
  ]);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("technical_terms notation inconsistencies"),
    ),
    `Expected notation inconsistency warning, got: ${JSON.stringify(result.warnings)}`,
  );
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("high-risk technical_terms unresolved"),
    ),
    `Expected unresolved high-risk warning, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun does not treat spaced words as merged term match", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] type script の違いを確認します。",
      "## 2. 本編",
      "[speaker:student] ここでは型システムの話をします。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "TypeScript", note: "語連結誤検出を防ぐ" }],
  }));
  const result = await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: { missing_in_script: string[] };
  };
  assert.deepEqual(report.details.missing_in_script, ["TypeScript"]);
  assert.ok(
    result.warnings.some((warning) => warning.includes("technical_terms missing in script")),
  );
});

test("checkRun treats multi-word technical term as covered when words are contiguous", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] Double Array Trie を使います。",
      "## 2. 本編",
      "[speaker:student] 実装を確認します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "Double Array Trie", note: "複合語" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun treats joined notation as covered for multi-word technical term", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] Double-Array-Trie を使います。",
      "## 2. 本編",
      "[speaker:student] 実装を確認します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "Double Array Trie", note: "結合表記許可" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun finds notation variants for multi-word term across spaced, joined, and hyphenated forms", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] Double Array Trie と DoubleArrayTrie の比較です。",
      "## 2. 本編",
      "[speaker:student] Double-Array-Trie も登場します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "Double Array Trie", note: "表記ゆれ確認" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: {
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.notation_inconsistencies, [
    {
      term: "Double Array Trie",
      variants: ["Double Array Trie", "Double-Array-Trie", "DoubleArrayTrie"],
    },
  ]);
});

test("checkRun resolves high-risk term by ruby notation case-insensitively", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] {typescript|タイプスクリプト} を説明します。",
      "## 2. 本編",
      "[speaker:student] 説明は続きます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "TypeScript", note: "Ruby解決テスト" }],
  }));
  const result = await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: { unresolved_high_risk_terms: string[] };
  };
  assert.deepEqual(report.details.unresolved_high_risk_terms, []);
  assert.ok(
    !result.warnings.some((warning) => warning.includes("high-risk technical_terms unresolved")),
  );
});

test("checkRun adds report-written warning when technical_terms warnings exist", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] API について話します。",
      "## 2. 本編",
      "[speaker:student] 解説を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "TypeScript", note: "missing warningを発生させる" }],
  }));
  const result = await checkRun({ runDir });
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("technical_terms audit report written to context/E01_technical_terms_audit.json"),
    ),
    `Expected report written warning when audit has warnings, got: ${JSON.stringify(result.warnings)}`,
  );
});

test("checkRun matches non-ascii technical term by normalized substring", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] 形態素解析の基本を説明します。",
      "## 2. 本編",
      "[speaker:student] 形態素解析をもう一度確認します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "形態素解析", note: "非ASCII term" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun treats contiguous mixed technical terms as covered", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエストとv8エンジンを説明します。",
      "## 2. 本編",
      "[speaker:student] HTTPリクエストを再確認します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "HTTPリクエスト", note: "mixed term" },
      { term: "v8エンジン", note: "mixed term" },
    ],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 2);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun does not treat spaced or hyphenated mixed technical term as covered", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTP リクエストとHTTP-リクエストの違いを説明します。",
      "## 2. 本編",
      "[speaker:student] 用語確認を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "HTTPリクエスト", note: "mixed term strict contiguous" }],
  }));
  const result = await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: { missing_in_script: string[] };
  };
  assert.deepEqual(report.details.missing_in_script, ["HTTPリクエスト"]);
  assert.ok(
    result.warnings.some((warning) => warning.includes("technical_terms missing in script")),
  );
});

test("checkRun normalizes mixed technical term coverage by NFKC and case", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] ＨＴＴＰリクエストとV8エンジンを説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "HTTPリクエスト", note: "NFKC normalization" },
      { term: "v8エンジン", note: "case normalization" },
    ],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 2);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun reports mixed term notation inconsistencies with raw variants", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエストとＨＴＴＰリクエストを比較します。",
      "## 2. 本編",
      "[speaker:student] 用語確認を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "HTTPリクエスト", note: "mixed notation variants" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: {
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.deepEqual(report.details.notation_inconsistencies, [
    {
      term: "HTTPリクエスト",
      variants: ["HTTPリクエスト", "ＨＴＴＰリクエスト"],
    },
  ]);
});

test("checkRun ignores mixed-term variants detected only at invalid ASCII boundaries", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエストとXＨＴＴＰリクエストを比較します。",
      "## 2. 本編",
      "[speaker:student] 用語確認を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "HTTPリクエスト", note: "mixed boundary variant filter" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: {
      missing_in_script: string[];
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.missing_in_script, []);
  assert.deepEqual(report.details.notation_inconsistencies, []);
});

test("checkRun keeps at least one variant for covered mixed term", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエストの例です。",
      "## 2. 本編",
      "[speaker:student] 確認を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "HTTPリクエスト", note: "variant invariant" }],
  }));
  const result = await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: {
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.notation_inconsistencies, []);
  assert.ok(
    !result.warnings.some((warning) =>
      warning.includes("covered technical term has no notation variants"),
    ),
  );
});

test("checkRun reports non-ascii notation inconsistencies with raw variants", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] サーバーとｻｰﾊﾞｰの表記を比較します。",
      "## 2. 本編",
      "[speaker:student] 用語確認を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "サーバー", note: "non-ascii notation variants" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: {
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.deepEqual(report.details.notation_inconsistencies, [
    {
      term: "サーバー",
      variants: ["ｻｰﾊﾞｰ", "サーバー"],
    },
  ]);
});

test("checkRun avoids non-ascii substring false-positive when morph tokenizer is available", async () => {
  const scriptText = [
    "## 1. オープニング",
    "[speaker:teacher] 相関数値を計算します。",
    "## 2. 本編",
    "[speaker:student] 例を続けます。",
  ].join("\n");
  const runDir = await prepareMinimalRun(["E01"], { E01: scriptText });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "関数", note: "substring false-positive regression" }],
  }));

  const result = await checkRun({
    runDir,
    morphTokenizerOverride: createMockMorphTokenizer({
      [scriptText]: ["相関数値", "を", "計算", "します", "例", "を", "続け", "ます"],
      関数: ["関数"],
    }),
  });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };

  assert.equal(report.summary.covered_terms, 0);
  assert.deepEqual(report.details.missing_in_script, ["関数"]);
  assert.ok(
    !result.warnings.some((warning) =>
      warning.includes("morphological tokenizer unavailable"),
    ),
  );
});

test("checkRun skips non-ascii technical term audit when morph tokenizer is unavailable", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] 相関数値を計算します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "関数", note: "substring fallback behavior" }],
  }));

  const result = await checkRun({ runDir, morphTokenizerOverride: null });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    schema_version: string;
    summary: {
      total_terms: number;
      evaluated_terms: number;
      covered_terms: number;
      coverage_ratio: number;
      skipped_non_ascii_terms_count: number;
    };
    details: {
      missing_in_script: string[];
      missing_in_dictionary_candidates: string[];
      skipped_non_ascii_terms: string[];
    };
  };

  assert.equal(report.schema_version, "1.1");
  assert.equal(report.summary.total_terms, 1);
  assert.equal(report.summary.evaluated_terms, 0);
  assert.equal(report.summary.covered_terms, 0);
  assert.equal(report.summary.coverage_ratio, 1);
  assert.equal(report.summary.skipped_non_ascii_terms_count, 1);
  assert.deepEqual(report.details.skipped_non_ascii_terms, ["関数"]);
  assert.deepEqual(report.details.missing_in_script, []);
  assert.deepEqual(report.details.missing_in_dictionary_candidates, []);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes(
        "E01: morphological tokenizer unavailable; skipped 1 non-ASCII term(s) — see audit report for details",
      ),
    ),
  );
});

test("checkRun keeps ascii technical term audit active when morph tokenizer is unavailable", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] API 設計を説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "API", note: "ascii should still be audited" }],
  }));

  const result = await checkRun({ runDir, morphTokenizerOverride: null });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { total_terms: number; evaluated_terms: number; covered_terms: number };
    details: { skipped_non_ascii_terms: string[]; missing_in_script: string[] };
  };

  assert.equal(report.summary.total_terms, 1);
  assert.equal(report.summary.evaluated_terms, 1);
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.skipped_non_ascii_terms, []);
  assert.deepEqual(report.details.missing_in_script, []);
  assert.ok(
    !result.warnings.some((warning) => warning.includes("skipped 1 non-ASCII term")),
  );
});

test("checkRun does not skip mixed technical term audit when morph tokenizer is unavailable", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエストを説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "HTTPリクエスト", note: "mixed should not be skipped" }],
  }));

  const result = await checkRun({ runDir, morphTokenizerOverride: null });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { total_terms: number; evaluated_terms: number; covered_terms: number };
    details: { skipped_non_ascii_terms: string[]; missing_in_script: string[] };
  };

  assert.equal(report.summary.total_terms, 1);
  assert.equal(report.summary.evaluated_terms, 1);
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.skipped_non_ascii_terms, []);
  assert.deepEqual(report.details.missing_in_script, []);
  assert.ok(
    !result.warnings.some((warning) => warning.includes("skipped 1 non-ASCII term")),
  );
});

test("checkRun skips dictionary and high-risk checks for non-ascii term when morph tokenizer is unavailable", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] 相関数値を計算します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "関数", note: "non-ascii skip all checks" }],
  }));

  const voicevoxTextDir = path.join(runDir, "voicevox_text");
  await mkdir(voicevoxTextDir, { recursive: true });
  await writeFile(
    path.join(voicevoxTextDir, "E01_voicevox_text.json"),
    `${JSON.stringify(
      {
        ...validVoicevoxText,
        dictionary_candidates: [],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  const result = await checkRun({ runDir, morphTokenizerOverride: null });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: {
      skipped_non_ascii_terms: string[];
      missing_in_dictionary_candidates: string[];
      unresolved_high_risk_terms: string[];
    };
  };

  assert.deepEqual(report.details.skipped_non_ascii_terms, ["関数"]);
  assert.deepEqual(report.details.missing_in_dictionary_candidates, []);
  assert.deepEqual(report.details.unresolved_high_risk_terms, []);
  assert.ok(
    !result.warnings.some((warning) =>
      warning.includes("technical_terms missing in dictionary_candidates"),
    ),
  );
});

test("checkRun accepts false-negative risk for non-ascii tokenization split mismatch in morph mode", async () => {
  const scriptText = [
    "## 1. オープニング",
    "[speaker:teacher] 形態素解析を学びます。",
    "## 2. 本編",
    "[speaker:student] 例を続けます。",
  ].join("\n");
  const runDir = await prepareMinimalRun(["E01"], { E01: scriptText });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "形態素解析", note: "token split mismatch" }],
  }));

  await checkRun({
    runDir,
    morphTokenizerOverride: createMockMorphTokenizer({
      [scriptText]: ["形態", "素", "解析", "を", "学び", "ます", "例", "を", "続け", "ます"],
      形態素解析: ["形態素", "解析"],
    }),
  });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };

  assert.equal(report.summary.covered_terms, 0);
  assert.deepEqual(report.details.missing_in_script, ["形態素解析"]);
});

test("checkRun extracts non-ascii notation variants from morph token-sequence matches", async () => {
  const scriptText = [
    "## 1. オープニング",
    "[speaker:teacher] サーバーとｻｰﾊﾞｰの表記を比較します。",
    "## 2. 本編",
    "[speaker:student] 用語確認を続けます。",
  ].join("\n");
  const runDir = await prepareMinimalRun(["E01"], { E01: scriptText });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "サーバー", note: "morph variant extraction" }],
  }));

  await checkRun({
    runDir,
    morphTokenizerOverride: createMockMorphTokenizer({
      [scriptText]: [
        "サーバー",
        "と",
        "ｻｰﾊﾞｰ",
        "の",
        "表記",
        "を",
        "比較",
        "します",
        "用語",
        "確認",
        "を",
        "続け",
        "ます",
      ],
      サーバー: ["サーバー"],
    }),
  });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    details: {
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };

  assert.deepEqual(report.details.notation_inconsistencies, [
    { term: "サーバー", variants: ["ｻｰﾊﾞｰ", "サーバー"] },
  ]);
});

test("checkRun does not allow substring false-positive for mixed technical term", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] v8エンジン2の例を説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "v8エンジン", note: "known limitation: substring false-positive" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 0);
  assert.deepEqual(report.details.missing_in_script, ["v8エンジン"]);
});

test("checkRun treats mixed technical terms as covered at Japanese particle and punctuation boundaries", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエストの例とv8エンジンを説明します。",
      "## 2. 本編",
      "[speaker:student] 「v8エンジン」、v8エンジン。も確認します。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "HTTPリクエスト", note: "particle boundary" },
      { term: "v8エンジン", note: "punctuation boundary" },
    ],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 2);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun rejects mixed technical term when adjacent to ASCII letters", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] Xv8エンジン と v8エンジンA、HTTPリクエストX を説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "v8エンジン", note: "ascii adjacency should fail" },
      { term: "HTTPリクエスト", note: "ascii suffix should fail" },
    ],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: {
      missing_in_script: string[];
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.equal(report.summary.covered_terms, 0);
  assert.deepEqual(report.details.missing_in_script, [
    "HTTPリクエスト",
    "v8エンジン",
  ]);
  assert.deepEqual(report.details.notation_inconsistencies, []);
});

test("checkRun rejects mixed technical term when adjacent to fullwidth ASCII letters", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] ＸHTTPリクエスト と v8エンジンＡ を説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "v8エンジン", note: "fullwidth ascii suffix should fail" },
      { term: "HTTPリクエスト", note: "fullwidth ascii prefix should fail" },
    ],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 0);
  assert.deepEqual(
    [...report.details.missing_in_script].sort((a, b) => a.localeCompare(b, "ja")),
    ["HTTPリクエスト", "v8エンジン"],
  );
});

test("checkRun treats mixed technical terms at line-end boundaries as covered", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエスト",
      "## 2. 本編",
      "[speaker:student] v8エンジン",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [
      { term: "HTTPリクエスト", note: "newline boundary term end" },
      { term: "v8エンジン", note: "newline boundary term end" },
    ],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 2);
  assert.deepEqual(report.details.missing_in_script, []);
});

test("checkRun keeps mixed term covered when valid and invalid boundaries coexist", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] HTTPリクエスト と XHTTPリクエスト を比較します。",
      "## 2. 本編",
      "[speaker:student] 用語確認を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "HTTPリクエスト", note: "mixed valid+invalid boundary coexist" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: {
      missing_in_script: string[];
      notation_inconsistencies: Array<{ term: string; variants: string[] }>;
    };
  };
  assert.equal(report.summary.covered_terms, 1);
  assert.deepEqual(report.details.missing_in_script, []);
  assert.deepEqual(report.details.notation_inconsistencies, []);
});

test("checkRun does not allow substring false-positive for mixed technical term with fullwidth digit suffix", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: [
      "## 1. オープニング",
      "[speaker:teacher] v8エンジン２の例を説明します。",
      "## 2. 本編",
      "[speaker:student] 例を続けます。",
    ].join("\n"),
  });
  await updateMaterialFiles(runDir, (data) => ({
    ...data,
    technical_terms: [{ term: "v8エンジン", note: "fullwidth digit suffix false-positive" }],
  }));
  await checkRun({ runDir });
  const reportPath = path.join(runDir, "context", "E01_technical_terms_audit.json");
  const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
    summary: { covered_terms: number };
    details: { missing_in_script: string[] };
  };
  assert.equal(report.summary.covered_terms, 0);
  assert.deepEqual(report.details.missing_in_script, ["v8エンジン"]);
});
