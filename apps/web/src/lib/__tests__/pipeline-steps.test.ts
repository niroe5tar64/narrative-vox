import { describe, expect, test } from "vitest";

import {
  derivePaths,
  getLayer1StepArgs,
  getLayer2StepArgs,
} from "@/lib/pipeline-steps";

describe("derivePaths", () => {
  test("returns paths for valid run key and episode", () => {
    const result = derivePaths("proj/run-001", "E01");
    expect(result).toEqual({
      script: "data/projects/proj/run-001/script/E01_script.md",
      voicevoxTextRaw:
        "data/projects/proj/run-001/voicevox_text/E01_voicevox_text.json",
      voicevoxTextPatched:
        "data/projects/proj/run-001/voicevox_text/E01_voicevox_text.patched.json",
      vvproj: "data/projects/proj/run-001/voicevox_project/E01.vvproj",
      runDir: "data/projects/proj/run-001",
    });
  });

  test("returns null when run key is empty", () => {
    expect(derivePaths("", "E01")).toBeNull();
  });

  test("returns null when episode is empty", () => {
    expect(derivePaths("proj/run-001", "")).toBeNull();
  });
});

describe("step args", () => {
  test("layer1 gen-blueprint", () => {
    expect(getLayer1StepArgs("gen-blueprint", "p1", "E01", "run-dir")).toEqual([
      "--project-id",
      "p1",
    ]);
  });

  test("layer1 gen-material", () => {
    expect(getLayer1StepArgs("gen-material", "p1", "E01", "run-dir")).toEqual([
      "--project-id",
      "p1",
      "--episode-id",
      "E01",
      "--run-dir",
      "run-dir",
    ]);
  });

  test("layer2 build-text", () => {
    const paths = derivePaths("proj/run-001", "E01");
    if (!paths) throw new Error("paths should not be null");
    expect(getLayer2StepArgs("build-text", paths)).toEqual([
      "--script",
      "data/projects/proj/run-001/script/E01_script.md",
    ]);
  });

  test("layer2 build-audio", () => {
    const paths = derivePaths("proj/run-001", "E01");
    if (!paths) throw new Error("paths should not be null");
    expect(getLayer2StepArgs("build-audio", paths)).toEqual([
      "--vvproj",
      "data/projects/proj/run-001/voicevox_project/E01.vvproj",
    ]);
  });
});
