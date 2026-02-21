# ADR-0004: apps/packages/data 構成への本体移行

- Date: 2026-02-21
- Status: Accepted

## Context

CLI/API 本体、ドメインロジック、外部I/O、品質チェックが `src/` 直下に同居しており、責務境界と依存関係の把握コストが高かった。
また、実行データ (`inputs/`, `projects/`) と設定 (`configs/*`) の配置が機能軸で分かれておらず、運用上の参照規約が曖昧だった。

## Decision

以下を一括で採用する。

1. ルート構成を `apps/ + packages/ + data/` に再編する。
2. 実装を責務単位へ移設する。
   - `apps/api/src`
   - `apps/cli/src`
   - `packages/{domain,application,infrastructure,quality}/src`
3. データ配置を `data/inputs`, `data/projects` に統一する。
4. 設定配置を機能軸に統一する。
   - `configs/pipeline/projects`
   - `configs/voice/voicevox`
   - `configs/content/{styles,characters}`
5. Bun workspaces を導入し、import を workspace package 名 (`@narrative-vox/*`) に統一する。
6. TypeScript は `tsconfig.base.json` を共通基盤とし、各 workspace に `tsconfig.json` を持たせる。

## Consequences

- CLI の主要コマンド (`build-text`, `build-project`, `build-audio`, `build-all`, `check-run`, `prepare-run`) は新構成パスを前提に動作する。
- テスト・型チェックは新パス構成に追従する。
- 今後の開発では旧パス (`src/*`, `inputs/*`, `projects/*`, 旧 `configs/*`) を新規追加しない。
