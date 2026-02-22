import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "bun:test";
import { validateAgainstSchema } from "@narrative-vox/quality/schema-validator.ts";

const sampleRunDir = path.resolve("tests/fixtures/sample-run");

async function loadJson<T>(filePath: string): Promise<T> {
	const raw = await readFile(filePath, "utf-8");
	return JSON.parse(raw) as T;
}

test("blueprint sample matches schema", async () => {
	const blueprintPath = path.join(
		sampleRunDir,
		"blueprint",
		"project_blueprint.json",
	);
	const schemaPath = path.resolve("schemas/blueprint.schema.json");
	const data = await loadJson<unknown>(blueprintPath);

	await validateAgainstSchema(data, schemaPath);
});

test("material samples match schema", async () => {
	const materialDir = path.join(sampleRunDir, "material");
	const schemaPath = path.resolve("schemas/episode-material.schema.json");
	const files = (await readdir(materialDir))
		.filter((name) => /^E[0-9]{2}_material\.json$/.test(name))
		.sort();

	assert.ok(files.length > 0);

	for (const fileName of files) {
		const filePath = path.join(materialDir, fileName);
		const data = await loadJson<unknown>(filePath);
		await validateAgainstSchema(data, schemaPath);
	}
});
