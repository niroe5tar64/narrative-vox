export type CandidateSource = "ruby" | "token" | "morph";
export type ReadingSource = "" | "ruby" | "morph" | "inferred";
export type CandidatePriority = "HIGH" | "MEDIUM" | "LOW";

export interface VoicevoxTextUtterance {
  utterance_id: string;
  section_id: number;
  section_title: string;
  text: string;
  pause_length_ms: number;
}

export interface DictionaryCandidate {
  surface: string;
  reading_or_empty: string;
  priority: CandidatePriority;
  occurrences: number;
  source: CandidateSource;
  note: string;
}

export interface SpeakabilityMetrics {
  score: number;
  average_chars_per_utterance: number;
  long_utterance_ratio: number;
  terminal_punctuation_ratio: number;
}

export interface VoicevoxTextQualityChecks {
  utterance_count: number;
  max_chars_per_utterance: number;
  has_ruby_notation: boolean;
  speakability: SpeakabilityMetrics;
  warnings: string[];
}

export interface VoicevoxTextMeta {
  project_id: string;
  run_id: string;
  episode_id: string;
  source_script_path: string;
  generated_at: string;
}

export interface VoicevoxTextData {
  schema_version: "1.0";
  meta: VoicevoxTextMeta;
  utterances: VoicevoxTextUtterance[];
  dictionary_candidates: DictionaryCandidate[];
  quality_checks: VoicevoxTextQualityChecks;
}
