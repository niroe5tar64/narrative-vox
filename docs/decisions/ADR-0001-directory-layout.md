# ADR-0001: ディレクトリ構成を責務分離する

## Status
Accepted (2026-02-11, amended)

## Context

旧構成では `references/` に入力・プロンプト・成果物が混在し、
自動化時の入出力境界が不明瞭だった。
加えて `projects/*/run-*-reference/` の命名と意味が衝突し、
成果物と参照資料の区別をさらに曖昧にしていた。

## Decision

以下を分離する。

- 入力: `inputs/`
- 実行成果物: `projects/`
- プロンプト: `prompts/`
- 設定: `configs/`
- スキーマ: `schemas/`
- 実装: `src/`
- テスト: `tests/`
- 参照資料:
  - 設計・運用文書: `docs/`
  - テスト用の固定データ: `tests/fixtures/`（必要時に作成）

トップレベルの `references/` は廃止する。

## Consequences

- パイプライン実装時の責務が明確になる
- 既存パス互換は意図的に提供しない（短期的に壊れる可能性を許容）
- Stage 4/5 実装時に `projects/` の段構造をそのまま拡張できる
- `run-*` は実行成果物のみを表す命名へ統一できる
