import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false
});
const validatorBySchemaPath = new Map();

export async function validateAgainstSchema(data, schemaPath) {
  const resolvedSchemaPath = path.resolve(schemaPath);
  let validate = validatorBySchemaPath.get(resolvedSchemaPath);
  if (!validate) {
    const raw = await readFile(resolvedSchemaPath, "utf-8");
    const schema = JSON.parse(raw);
    validate = ajv.compile(schema);
    validatorBySchemaPath.set(resolvedSchemaPath, validate);
  }
  const valid = validate(data);
  if (valid) {
    return;
  }

  const details = (validate.errors ?? [])
    .map((error) => {
      const where = error.instancePath || "/";
      return `${where} ${error.message ?? "validation error"}`;
    })
    .join("; ");

  throw new Error(`Schema validation failed (${path.basename(resolvedSchemaPath)}): ${details}`);
}
