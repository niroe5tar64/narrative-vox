import path from "node:path";
import {
  logStep,
  validateJsonSchema,
  writePrettyJson,
  writeTextFile,
} from "./shared.ts";

function logSavedRelativePath(stepLabel: string, filePath: string): void {
  logStep(stepLabel, `Saved: ${path.relative(process.cwd(), filePath)}`);
}

export async function saveJsonArtifact(options: {
  stepLabel: string;
  filePath: string;
  data: unknown;
}): Promise<void> {
  const { stepLabel, filePath, data } = options;
  await writePrettyJson(filePath, data);
  logSavedRelativePath(stepLabel, filePath);
}

export async function saveTextArtifact(options: {
  stepLabel: string;
  filePath: string;
  content: string;
}): Promise<void> {
  const { stepLabel, filePath, content } = options;
  await writeTextFile(filePath, content);
  logSavedRelativePath(stepLabel, filePath);
}

export async function logJsonSchemaValidation(options: {
  stepLabel: string;
  data: unknown;
  schemaPath: string;
}): Promise<void> {
  const { stepLabel, data, schemaPath } = options;
  const validation = await validateJsonSchema(data, schemaPath);
  if (validation.ok) {
    logStep(stepLabel, "Schema validation: OK");
    return;
  }
  logStep(stepLabel, `Schema validation: WARN - ${validation.message}`);
}
