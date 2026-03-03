import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  _resolveLanguage,
  _shouldExclude,
  _shouldInclude,
} from "@narrative-vox/authoring/gen-source-index/oss-dive-collector.ts";

test("resolveLanguage maps common extensions", () => {
  assert.equal(_resolveLanguage("src/index.ts"), "typescript");
  assert.equal(_resolveLanguage("app.js"), "javascript");
  assert.equal(_resolveLanguage("main.py"), "python");
  assert.equal(_resolveLanguage("lib.rs"), "rust");
  assert.equal(_resolveLanguage("main.go"), "go");
  assert.equal(_resolveLanguage("style.css"), "css");
  assert.equal(_resolveLanguage("README.md"), "markdown");
  assert.equal(_resolveLanguage("config.yaml"), "yaml");
  assert.equal(_resolveLanguage("schema.json"), "json");
});

test("resolveLanguage handles Makefile and Dockerfile", () => {
  assert.equal(_resolveLanguage("Makefile"), "makefile");
  assert.equal(_resolveLanguage("Dockerfile"), "dockerfile");
  assert.equal(_resolveLanguage("Dockerfile.dev"), "dockerfile");
});

test("resolveLanguage returns null for unknown extensions", () => {
  assert.equal(_resolveLanguage("file.xyz"), null);
  assert.equal(_resolveLanguage("binary.bin"), null);
  assert.equal(_resolveLanguage("image.png"), null);
});

test("shouldExclude filters node_modules", () => {
  assert.equal(_shouldExclude("node_modules/foo/bar.js", ["node_modules"]), true);
  assert.equal(_shouldExclude("src/index.ts", ["node_modules"]), false);
});

test("shouldExclude filters .git", () => {
  assert.equal(_shouldExclude(".git/config", [".git"]), true);
  assert.equal(_shouldExclude("src/.gitignore", [".git"]), false);
});

test("shouldExclude filters custom patterns", () => {
  assert.equal(
    _shouldExclude("vendor/lib/foo.go", ["vendor", "node_modules"]),
    true,
  );
  assert.equal(
    _shouldExclude("src/lib/foo.go", ["vendor", "node_modules"]),
    false,
  );
});

test("shouldInclude accepts whitelisted extensions", () => {
  assert.equal(_shouldInclude("src/index.ts"), true);
  assert.equal(_shouldInclude("lib/main.py"), true);
  assert.equal(_shouldInclude("app.go"), true);
});

test("shouldInclude rejects non-whitelisted files", () => {
  assert.equal(_shouldInclude("image.png"), false);
  assert.equal(_shouldInclude("data.bin"), false);
  assert.equal(_shouldInclude("archive.tar.gz"), false);
});

test("shouldInclude accepts well-known filenames", () => {
  assert.equal(_shouldInclude("Makefile"), true);
  assert.equal(_shouldInclude("Dockerfile"), true);
  assert.equal(_shouldInclude("Gemfile"), true);
});
