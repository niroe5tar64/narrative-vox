import path from "node:path";

export const RUN_ID_RE = /^run-\d{8}-\d{4}$/;

function toRunIdTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

export function makeRunIdNow(now: Date = new Date()): string {
  const year = String(now.getFullYear());
  const month = toRunIdTimestampPart(now.getMonth() + 1);
  const day = toRunIdTimestampPart(now.getDate());
  const hour = toRunIdTimestampPart(now.getHours());
  const minute = toRunIdTimestampPart(now.getMinutes());
  return `run-${year}${month}${day}-${hour}${minute}`;
}

export function validateRunId(runId: string): string {
  if (RUN_ID_RE.test(runId)) {
    return runId;
  }
  throw new Error(
    `Invalid --run-id "${runId}". Expected format: run-YYYYMMDD-HHMM`
  );
}

export function findRunIdInPath(runDir: string): string | undefined {
  const segments = path.resolve(runDir).split(path.sep).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (RUN_ID_RE.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveRunId(runDir: string, explicitRunId?: string): string {
  if (explicitRunId) {
    return validateRunId(String(explicitRunId));
  }
  const inferred = findRunIdInPath(runDir);
  if (inferred) {
    return inferred;
  }
  return makeRunIdNow();
}

export function inferProjectIdFromRunDir(runDir: string): string {
  return path.basename(path.dirname(path.resolve(runDir)));
}
