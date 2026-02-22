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
