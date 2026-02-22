import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { config } from "../config.ts";

const ajv = new Ajv2020({
	allErrors: true,
	strict: false,
	validateFormats: false,
});
const cache = new Map<string, ValidateFunction>();

async function getValidator(schemaName: string): Promise<ValidateFunction> {
	if (!cache.has(schemaName)) {
		const schemaPath = join(
			config.repoRoot,
			"schemas",
			`${schemaName}.schema.json`,
		);
		const schema = await Bun.file(schemaPath).json();
		cache.set(schemaName, ajv.compile(schema));
	}
	const validator = cache.get(schemaName);
	if (!validator) {
		throw new Error(`Validator for ${schemaName} is not available`);
	}
	return validator;
}

/**
 * データをJSONスキーマで検証する。
 * @returns エラーメッセージの配列（検証失敗時）、またはnull（検証成功時）
 */
export async function validateConfig(
	data: unknown,
	schemaName: string,
): Promise<string[] | null> {
	const validate = await getValidator(schemaName);
	const valid = validate(data);
	if (!valid) {
		return (validate.errors ?? []).map(
			(e: ErrorObject) =>
				`${e.instancePath || "/"} ${e.message ?? "validation error"}`,
		);
	}
	return null;
}
