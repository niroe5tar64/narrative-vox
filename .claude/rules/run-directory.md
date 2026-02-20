---
paths:
  - "projects/**/*"
  - "src/shared/run_id.ts"
  - "src/cli/prepare_run.ts"
  - "configs/projects/*.json"
---

# Run ディレクトリの作成ルール

run ディレクトリ（`projects/<project-id>/run-YYYYMMDD-HHMM/`）を新規作成する際は、手動で `mkdir` しない。

必ず以下のいずれかを使うこと:

1. `bun run prepare-run` — 既存 run からのクローン
2. run ID の生成のみ必要な場合:
   ```bash
   bun -e "import { makeRunIdNow } from './src/shared/run_id.ts'; console.log(makeRunIdNow())"
   ```

定義: `src/shared/run_id.ts`（`RUN_ID_RE = /^run-\d{8}-\d{4}$/`, `makeRunIdNow()`）
