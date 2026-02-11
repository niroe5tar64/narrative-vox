import path from "node:path";
import { readFile } from "node:fs/promises";
import { validateAgainstSchema } from "../quality/schema_validator.ts";

export async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

export async function loadJson<T>(filePath: string, schemaPath?: string): Promise<T> {
  const data = await readJson(filePath);
  if (schemaPath) {
    const resolvedSchemaPath = schemaPath.startsWith("/")
      ? schemaPath
      : path.resolve(schemaPath);
    await validateAgainstSchema(data, resolvedSchemaPath);
  }
  return data as T;
}
