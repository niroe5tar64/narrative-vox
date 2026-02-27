import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import {
  dirExists,
  type VoicevoxTextForCheckRun,
} from "../shared.ts";

const VOICEVOX_TEXT_FILE_RE = /^(E[0-9]{2})_voicevox_text\.json$/;
const VVPROJ_META_RE = /^(E[0-9]{2})_voicevox_project_meta\.json$/;

export async function validateLayer2Artifacts(params: {
  resolvedRunDir: string;
  warnings: string[];
}): Promise<{
  dictionarySurfacesByEpisodeId: Map<string, string[]>;
  highPriorityDictionarySurfacesByEpisodeId: Map<string, string[]>;
  candidatesWithoutReadingByEpisodeId: Map<string, string[]>;
  validVoicevoxTextByEpisodeId: Set<string>;
}> {
  const dictionarySurfacesByEpisodeId = new Map<string, string[]>();
  const highPriorityDictionarySurfacesByEpisodeId = new Map<string, string[]>();
  const candidatesWithoutReadingByEpisodeId = new Map<string, string[]>();
  const validVoicevoxTextByEpisodeId = new Set<string>();

  const voicevoxTextDir = path.join(params.resolvedRunDir, "voicevox_text");
  if (await dirExists(voicevoxTextDir)) {
    const textFiles = (await readdir(voicevoxTextDir))
      .filter((name) => VOICEVOX_TEXT_FILE_RE.test(name))
      .sort();
    for (const fileName of textFiles) {
      const filePath = path.join(voicevoxTextDir, fileName);
      const episodeId = fileName.replace("_voicevox_text.json", "");
      try {
        const voicevoxText = await loadJson<VoicevoxTextForCheckRun>(
          filePath,
          SchemaPaths.voicevoxText,
        );
        const surfaces = Array.isArray(voicevoxText.dictionary_candidates)
          ? voicevoxText.dictionary_candidates
              .map((candidate) => candidate.surface)
              .filter((surface): surface is string => typeof surface === "string")
          : [];
        const highPrioritySurfaces = Array.isArray(voicevoxText.dictionary_candidates)
          ? voicevoxText.dictionary_candidates
              .filter((candidate) => candidate.priority === "HIGH")
              .map((candidate) => candidate.surface)
              .filter((surface): surface is string => typeof surface === "string")
          : [];
        const highOrMediumWithoutReadingSurfaces = Array.isArray(
          voicevoxText.dictionary_candidates,
        )
          ? voicevoxText.dictionary_candidates
              .filter(
                (candidate) =>
                  (candidate.priority === "HIGH" || candidate.priority === "MEDIUM") &&
                  typeof candidate.surface === "string" &&
                  String(candidate.reading_or_empty ?? "").trim().length === 0,
              )
              .map((candidate) => candidate.surface)
              .filter((surface): surface is string => typeof surface === "string")
          : [];
        dictionarySurfacesByEpisodeId.set(episodeId, surfaces);
        highPriorityDictionarySurfacesByEpisodeId.set(
          episodeId,
          highPrioritySurfaces,
        );
        candidatesWithoutReadingByEpisodeId.set(
          episodeId,
          highOrMediumWithoutReadingSurfaces,
        );
        validVoicevoxTextByEpisodeId.add(episodeId);
      } catch (error) {
        params.warnings.push(
          `voicevox_text/${fileName}: schema validation failed — ${(error as Error).message}`,
        );
      }
    }
  }

  const voicevoxProjectDir = path.join(params.resolvedRunDir, "voicevox_project");
  if (await dirExists(voicevoxProjectDir)) {
    const metaFiles = (await readdir(voicevoxProjectDir))
      .filter((name) => VVPROJ_META_RE.test(name))
      .sort();
    for (const fileName of metaFiles) {
      const filePath = path.join(voicevoxProjectDir, fileName);
      try {
        await loadJson(filePath, SchemaPaths.voicevoxProjectMeta);
      } catch (error) {
        params.warnings.push(
          `voicevox_project/${fileName}: schema validation failed — ${(error as Error).message}`,
        );
      }
    }
  }

  return {
    dictionarySurfacesByEpisodeId,
    highPriorityDictionarySurfacesByEpisodeId,
    candidatesWithoutReadingByEpisodeId,
    validVoicevoxTextByEpisodeId,
  };
}
