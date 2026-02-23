import path from "node:path";

export interface RunContract {
  version: 1;
  projectId: string;
  runId: string;
  runDir: string;
  createdAt: string; // ISO 8601
}

export const RUN_CONTRACT_FILENAME = "run-contract.json";

export function runContractPath(runDir: string): string {
  return path.join(runDir, RUN_CONTRACT_FILENAME);
}

export function createRunContract(params: {
  projectId: string;
  runId: string;
  runDir: string;
}): RunContract {
  return {
    version: 1,
    projectId: params.projectId,
    runId: params.runId,
    runDir: params.runDir,
    createdAt: new Date().toISOString(),
  };
}
