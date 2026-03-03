export interface LogEntry {
  type: "stdout" | "stderr" | "system";
  data: string;
  ts: string;
  seq: number;
  code?: number;
  cancelled?: boolean;
}

export interface JobStartResult {
  jobId: string;
  command: string;
  args: string[];
  startedAt: string;
}

export interface JobCancelResult {
  jobId: string;
  status: string;
  cancelled: boolean;
}

export interface PipelineRunRequest {
  command: string;
  args: string[];
}

export const AUTHORING_STEPS = [
  "gen-source-index",
  "gen-blueprint",
  "gen-episode-pack",
  "gen-script",
  "update-series-context",
] as const;

export type AuthoringStep = (typeof AUTHORING_STEPS)[number];
