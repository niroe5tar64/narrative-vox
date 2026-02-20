# ADR-0002: 層化アーキテクチャに合わせてディレクトリ構成を再編する

## Status
Proposed (2026-02-20)

## Context

`ADR-0001` によりトップレベル責務分離（`inputs/`, `projects/`, `prompts/`, `configs/`, `schemas/`, `src/`, `tests/`, `docs/`）は達成した。
一方で、以下の課題が残っている。

- `src/shared/` に責務が集中し、ドメインロジックとI/O境界が曖昧
- `src/pipeline/` がユースケース層と外部連携層を同時に抱えている
- `scripts/` と `skills/` が開発・運用ツール群として分離されていない
- `projects/<project-id>/run-*` 配下に旧来の段構造や暫定ファイルが混在し、run契約が不明瞭

今後の機能追加と保守性を優先し、物理配置を層構造へ合わせて再設計する。
既存互換は不要であり、旧データ破棄を許容する。

## Decision

以下を採用する。

1. `src/` を層化構成へ再編する。
   - `src/cli/`: CLIエントリポイントと引数解決
   - `src/app/`: ユースケース（build/check/prepare/render）
   - `src/domain/`: 純粋ロジック・型・ルール
   - `src/infra/`: 外部I/O（filesystem, VOICEVOX API, process）
   - `src/quality/`: 検証・監査ロジック
2. ツール群を `tools/` に集約する。
   - `tools/scripts/`: 運用スクリプト（旧 `scripts/`）
   - `tools/skills/`: Skill定義（旧 `skills/`）
3. `tests/` を責務別に再編する。
   - `tests/unit/`
   - `tests/integration/`
   - `tests/fixtures/`
4. runディレクトリの許可サブディレクトリを固定する。
   - `blueprint/`, `material/`, `script/`, `context/`, `voicevox_text/`, `dict_candidates/`, `voicevox_project/`, `audio/`
   - 追加で `run_manifest.json` をrunメタ情報の正規保存先とする
   - 上記以外（例: `stage1`, `stage2`, `stage3`, `variables`）は非対応とし、移行時に削除対象とする
5. 移行は一括切替（big-bang）で実施する。
   - 旧パス互換レイヤは提供しない
   - 旧runデータは必要に応じて破棄する

## Consequences

- 初回移行で import パス、npm scripts、ドキュメント参照パス、テスト配置が広範囲に変更される
- 移行中は一時的に `bun test` / `bun run typecheck` が不安定になる可能性がある
- 移行完了後は「ユースケース」「ドメイン」「外部I/O」の境界が明確になり、保守性が向上する
- runデータの契約が明確になり、生成物検証と運用が単純化される

## Migration Notes

- このADR承認後に、以下を同一作業として実施する。
  - ディレクトリ移動と import 更新
  - `package.json` scripts のパス更新
  - `README.md` / `docs/architecture/*` / `tests/README.md` の追従
  - `check-run` に run契約（許可ディレクトリ）検証を追加
- 互換維持ではなく、最新構成への全面移行を唯一のサポート対象とする。
