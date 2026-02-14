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

fixture 運用:

- 共有前提データは `projects/*/run-*` ではなく `tests/fixtures/sample-run` を使う。
- fixture 更新時は stage1〜stage5 の整合を保ち、変更後に `bun run test` を実行して `ENOENT` が出ないことを確認する。
- fixture の内容・方針は `tests/fixtures/README.md` を参照する。
