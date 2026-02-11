import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false
});

export async function validateAgainstSchema(data, schemaPath) {
  const raw = await readFile(schemaPath, "utf-8");
  const schema = JSON.parse(raw);
  const validate = ajv.compile(schema);
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

  throw new Error(`Schema validation failed (${path.basename(schemaPath)}): ${details}`);
}
