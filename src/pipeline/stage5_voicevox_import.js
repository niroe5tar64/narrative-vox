import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.js";

function toAudioKey(episodeId, utteranceId) {
  return `${episodeId}_${utteranceId}`;
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function resolveProfilePath(profilePath) {
  if (profilePath) {
    return path.resolve(profilePath);
  }

  const localDefault = path.resolve("configs/voicevox/default_profile.json");
  try {
    await access(localDefault);
    return localDefault;
  } catch {
    return path.resolve("configs/voicevox/default_profile.example.json");
  }
}

export async function runStage5({
  stage4JsonPath,
  outDir,
  profilePath,
  engineId,
  speakerId,
  styleId,
  appVersion
}) {
  const resolvedStage4Path = path.resolve(stage4JsonPath);
  const resolvedOutDir = path.resolve(outDir);
  const resolvedProfilePath = await resolveProfilePath(profilePath);

  const stage4Data = await loadJson(resolvedStage4Path);
  const profile = await loadJson(resolvedProfilePath);

  const finalEngineId = engineId || profile.engineId;
  const finalSpeakerId = speakerId || profile.speakerId;
  const finalStyleId = Number(styleId ?? profile.styleId);
  const finalAppVersion = appVersion || profile.appVersion || "0.0.0";

  const audioKeys = [];
  const audioItems = {};

  for (const utterance of stage4Data.utterances) {
    const key = toAudioKey(stage4Data.meta.episode_id, utterance.utterance_id);
    audioKeys.push(key);
    audioItems[key] = {
      text: utterance.text,
      voice: {
        engineId: finalEngineId,
        speakerId: finalSpeakerId,
        styleId: finalStyleId
      }
    };
  }

  const vvproj = {
    appVersion: finalAppVersion,
    talk: {
      audioKeys,
      audioItems
    },
    song: {
      tpqn: Number(profile.tpqn ?? 480),
      tempos: [
        {
          position: 0,
          bpm: Number(profile.tempoBpm ?? 120)
        }
      ],
      timeSignatures: [
        {
          measureNumber: 1,
          beats: Number(profile.timeSignature?.beats ?? 4),
          beatType: Number(profile.timeSignature?.beatType ?? 4)
        }
      ],
      tracks: {},
      trackOrder: []
    }
  };

  await validateAgainstSchema(
    vvproj,
    path.resolve(process.cwd(), "schemas/stage5.voicevox-import.schema.json")
  );

  const stage5Dir = path.join(resolvedOutDir, "stage5");
  await mkdir(stage5Dir, { recursive: true });

  const episodeId = stage4Data.meta.episode_id;
  const importJsonPath = path.join(stage5Dir, `${episodeId}_voicevox_import.json`);
  const vvprojPath = path.join(stage5Dir, `${episodeId}.vvproj`);

  const serialized = `${JSON.stringify(vvproj, null, 2)}\n`;
  await writeFile(importJsonPath, serialized, "utf-8");
  await writeFile(vvprojPath, serialized, "utf-8");

  return {
    importJsonPath,
    vvprojPath,
    audioItemCount: audioKeys.length,
    episodeId
  };
}
