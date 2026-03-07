import { describe, expect, test } from "vitest";

import {
  derivePaths,
  getAuthoringStepArgs,
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
  test("authoring gen-source-index", () => {
    expect(getAuthoringStepArgs("gen-source-index", "p1", "E01")).toEqual([
      "--project-id",
      "p1",
    ]);
  });

  test("authoring gen-blueprint", () => {
    expect(getAuthoringStepArgs("gen-blueprint", "p1", "E01")).toEqual([
      "--project-id",
      "p1",
    ]);
  });

  test("authoring gen-episode-pack", () => {
    expect(getAuthoringStepArgs("gen-episode-pack", "p1", "E01")).toEqual([
      "--project-id",
      "p1",
      "--episode-id",
      "E01",
    ]);
  });

  test("authoring gen-script", () => {
    expect(getAuthoringStepArgs("gen-script", "p1", "E01")).toEqual([
      "--project-id",
      "p1",
      "--episode-id",
      "E01",
    ]);
  });

  test("authoring update-series-context", () => {
    expect(
      getAuthoringStepArgs("update-series-context", "p1", "E01"),
    ).toEqual(["--project-id", "p1", "--episode-id", "E01"]);
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
