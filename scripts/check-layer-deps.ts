/**
 * CI lint script: check for layer dependency violations.
 *
 * Correct dependency direction:
 *   domain ← infrastructure ← quality ← application ← cli
 *
 * Forbidden imports:
 *   packages/domain      → packages/infrastructure | packages/quality | packages/application
 *   packages/infrastructure → packages/quality | packages/application
 *   packages/quality     → packages/application
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface ForbiddenRule {
  sourcePackage: string;
  forbiddenTargets: string[];
}

const RULES: ForbiddenRule[] = [
  {
    sourcePackage: "packages/domain",
    forbiddenTargets: [
      "packages/infrastructure",
      "packages/quality",
      "packages/application",
    ],
  },
  {
    sourcePackage: "packages/infrastructure",
    forbiddenTargets: ["packages/quality", "packages/application"],
  },
  {
    sourcePackage: "packages/quality",
    forbiddenTargets: ["packages/application"],
  },
];

const IMPORT_RE = /from\s+["']([^"']+)["']/g;

async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function checkFile(
  filePath: string,
  forbiddenTargets: string[],
  repoRoot: string,
): Promise<string[]> {
  const content = await readFile(filePath, "utf-8");
  const violations: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const importPath = match[1];
    for (const target of forbiddenTargets) {
      // Match @narrative-vox/<package-name> style or relative paths going into target packages
      const pkgName = target.split("/").pop() ?? target;
      if (
        importPath.includes(`@narrative-vox/${pkgName}`) ||
        importPath.includes(`/${pkgName}/`)
      ) {
        const relFile = path.relative(repoRoot, filePath);
        violations.push(`  ${relFile}: imports from ${target} ("${importPath}")`);
      }
    }
  }
  return violations;
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(import.meta.dir, "..");
  const allViolations: string[] = [];

  for (const rule of RULES) {
    const srcDir = path.join(repoRoot, rule.sourcePackage, "src");
    let files: string[];
    try {
      files = await collectTsFiles(srcDir);
    } catch {
      // src dir may not exist, skip
      continue;
    }
    for (const file of files) {
      const violations = await checkFile(file, rule.forbiddenTargets, repoRoot);
      allViolations.push(...violations);
    }
  }

  if (allViolations.length === 0) {
    console.log("✓ No layer dependency violations found.");
    process.exit(0);
  } else {
    console.error(`✗ Layer dependency violations (${allViolations.length}):`);
    for (const v of allViolations) {
      console.error(v);
    }
    process.exit(1);
  }
}

await main();
