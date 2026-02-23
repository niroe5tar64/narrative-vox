import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type RunContract,
  RUN_CONTRACT_FILENAME,
} from "@narrative-vox/domain/run-contract.ts";
import { loadJson } from "./json.ts";
import { SchemaPaths } from "./schema-paths.ts";

export async function loadRunContract(runDir: string): Promise<RunContract> {
  const filePath = path.join(runDir, RUN_CONTRACT_FILENAME);
  return loadJson<RunContract>(filePath, SchemaPaths.runContract);
}

export async function saveRunContract(contract: RunContract): Promise<void> {
  const filePath = path.join(contract.runDir, RUN_CONTRACT_FILENAME);
  await writeFile(filePath, JSON.stringify(contract, null, 2) + "\n");
}
