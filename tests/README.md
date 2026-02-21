# Tests

`integration` / `unit` / `fixtures` の責務でテストを配置する。

実行方針:

- ローカル実行は `bun run test`（=`bun test`）を使う。
- テストコードの import は `bun:test` で統一する。
- CI も `.github/workflows/ci.yml` で `bun test` を実行し、ローカルと同一ランナーに揃える。

現状の主なテスト:

- `tests/integration/app/build-pipeline.test.ts`
- `tests/integration/app/build-text.unit.test.ts`
- `tests/integration/quality/check-run.test.ts`
- `tests/integration/quality/blueprint-material-schema.test.ts`
- `tests/integration/quality/voicevox-schema.test.ts`
- `tests/integration/cli/prepare-run.test.ts`

fixture 運用:

- 共有前提データは `data/projects/*/run-*` ではなく `tests/fixtures/sample-run` を使う。
- fixture 更新時は blueprint/material/script/voicevox_text/voicevox_project の整合を保ち、変更後に `bun run test` を実行して `ENOENT` が出ないことを確認する。
- fixture の内容・方針は `tests/fixtures/README.md` を参照する。
