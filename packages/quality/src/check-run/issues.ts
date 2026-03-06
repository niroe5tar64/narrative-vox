export type CheckRunValidationStage =
  | "artifact-collection"
  | "required-authoring"
  | "authoring-schemas"
  | "script-structure"
  | "authoring-cross-refs"
  | "technical-terms"
  | "optional-synthesis";

export interface CheckRunIssue {
  stage: CheckRunValidationStage;
  episodeId?: string;
  message: string;
}

export class CheckRunValidationError extends Error {
  public readonly issues: CheckRunIssue[];

  constructor(issues: CheckRunIssue[]) {
    const summary = issues
      .map(
        (i) =>
          `[${i.stage}]${i.episodeId ? ` ${i.episodeId}:` : ""} ${i.message}`,
      )
      .join("\n");
    super(`check-run validation failed:\n${summary}`);
    this.name = "CheckRunValidationError";
    this.issues = issues;
  }
}
