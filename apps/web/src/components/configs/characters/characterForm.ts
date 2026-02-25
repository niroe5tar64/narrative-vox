import type { CharacterConfig } from "@/api/client";

export const FIXED_ENGINE_ID = "074fc39e-678b-4c13-8916-ffca8d505d1d";

export const EMOTION_PRESETS: { key: string; label: string }[] = [
  { key: "calm", label: "落ち着いた" },
  { key: "energetic", label: "活発" },
  { key: "serious", label: "真剣" },
  { key: "confused", label: "困惑" },
  { key: "happy", label: "喜び" },
  { key: "sad", label: "悲しみ" },
  { key: "angry", label: "怒り" },
];

export type EmotionRow = {
  key: string;
  label: string;
  styleId: string;
  enabled: boolean;
};

export type CharForm = {
  key: string;
  name: string;
  description: string;
  voiceSpeakerId: string;
  voiceStyleId: string;
  emotionRows: EmotionRow[];
  profileJson: string;
};

export const PROFILE_TEMPLATE = {
  gender: "neutral",
  age_range: "adult",
  knowledge_level: "expert",
  personality_traits: ["特性1"],
  speech_register: "polite_desu_masu",
  sentence_patterns: {
    typical_endings: ["です", "ます"],
    filler_words: [],
    catchphrases: [],
    forbidden_patterns: [],
  },
  interaction_behavior: {
    explains_by: "logical_steps",
    responds_to_questions_by: "direct_answer",
    emotion_range: "moderate",
  },
  topic_affinity: {
    enthusiastic_about: [],
    cautious_about: [],
  },
};

export const EMPTY_FORM: CharForm = {
  key: "",
  name: "",
  description: "",
  voiceSpeakerId: "",
  voiceStyleId: "0",
  emotionRows: EMOTION_PRESETS.map((p) => ({
    ...p,
    styleId: "0",
    enabled: false,
  })),
  profileJson: JSON.stringify(PROFILE_TEMPLATE, null, 2),
};

export function charToForm(c: CharacterConfig): CharForm {
  return {
    key: c.key,
    name: c.name,
    description: c.description ?? "",
    voiceSpeakerId: c.voice.speakerId,
    voiceStyleId: String(c.voice.styleId),
    emotionRows: EMOTION_PRESETS.map((p) => {
      const existing = c.emotionStyles[p.key];
      return {
        key: p.key,
        label: p.label,
        styleId: existing !== undefined ? String(existing) : "0",
        enabled: existing !== undefined,
      };
    }),
    profileJson: c.profile
      ? JSON.stringify(c.profile, null, 2)
      : JSON.stringify(PROFILE_TEMPLATE, null, 2),
  };
}

export function formToChar(f: CharForm): CharacterConfig {
  let profile: Record<string, unknown> | undefined;
  try {
    profile = JSON.parse(f.profileJson) as Record<string, unknown>;
  } catch {
    profile = undefined;
  }
  return {
    key: f.key,
    name: f.name,
    ...(f.description && { description: f.description }),
    voice: {
      engineId: FIXED_ENGINE_ID,
      speakerId: f.voiceSpeakerId,
      styleId: Number(f.voiceStyleId),
    },
    emotionStyles: Object.fromEntries(
      f.emotionRows
        .filter((r) => r.enabled)
        .map((r) => [r.key, Number(r.styleId)]),
    ),
    ...(profile && { profile }),
  };
}
