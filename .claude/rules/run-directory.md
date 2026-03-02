---
paths:
  - "data/projects/**/*"
  - "apps/cli/**/*"
  - "packages/**/*"
  - ".tmp/renewal-spec/**/*.md"
---

# Run ディレクトリの作成ルール

run ディレクトリ（`data/projects/<project-id>/run-YYYYMMDD-HHMM/`）を新規作成する際は、手動で `mkdir` しない。

renewal の正本は `.tmp/renewal-spec/**` であり、run 作成契約は `spec-01` / `spec-06` / `spec-09` に従う。

## 基本ルール

- `gen-source-index` だけが run 未選択での新規 run 作成を許可する
- `gen-source-index --project-id <id>` は fresh run を作成する
- downstream step は既存 run を対象にする
- `prepare-run` は renewal 契約では廃止済みであり、run 作成の正規手段として使わない
- run ID を先に手動生成してディレクトリを切る運用は行わない

## 禁止事項

- 手動 `mkdir`
- `prepare-run` 前提の複製運用
- 旧 `projects/` パス前提の判断
- `.json` project config 前提の判断

## 参照先

- `.tmp/renewal-spec/01-pipeline-authoring.md`
- `.tmp/renewal-spec/06-run-directory.md`
- `.tmp/renewal-spec/09-detailed-design-appendix.md`
