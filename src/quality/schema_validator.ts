import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false
});
const validatorBySchemaPath = new Map<string, ValidateFunction>();

export async function validateAgainstSchema(data: unknown, schemaPath: string): Promise<void> {
  const resolvedSchemaPath = path.resolve(schemaPath);
  let validate = validatorBySchemaPath.get(resolvedSchemaPath);
  if (!validate) {
    const raw = await readFile(resolvedSchemaPath, "utf-8");
    const schema = JSON.parse(raw) as object;
    validate = ajv.compile(schema);
    validatorBySchemaPath.set(resolvedSchemaPath, validate);
  }
  const valid = validate(data);
  if (valid) {
    return;
  }

  const details = (validate.errors ?? ([] as ErrorObject[]))
    .map((error: ErrorObject) => {
      const where = error.instancePath || "/";
      return `${where} ${error.message ?? "validation error"}`;
    })
    .join("; ");

  throw new Error(`Schema validation failed (${path.basename(resolvedSchemaPath)}): ${details}`);
}
