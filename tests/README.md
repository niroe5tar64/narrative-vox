# Tests

pipeline / quality / voicevox のテストを配置する。

実行方針:

- ローカル実行は `bun run test`（=`bun test`）を使う。
- テストコードの import は `bun:test` で統一する。
- CI も `.github/workflows/ci.yml` で `bun test` を実行し、ローカルと同一ランナーに揃える。

現状の主なテスト:

- `tests/pipeline/build_pipeline.test.ts`
- `tests/pipeline/build_text.unit.test.ts`
- `tests/quality/check_run.test.ts`
- `tests/quality/stage1_stage2_schema.test.ts`
- `tests/quality/stage4_stage5_schema.test.ts`
- `tests/cli/prepare_run.test.ts`
