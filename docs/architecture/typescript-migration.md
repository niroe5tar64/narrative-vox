# TypeScript Operation Guide (移行完了後)

## 状態

このリポジトリの Stage4/Stage5 実装と関連テストは、2026-02-11 時点で `.ts` へ移行済みです。

主要ファイル:

- `src/cli/main.ts`
- `src/pipeline/stage4_voicevox_text.ts`
- `src/pipeline/stage5_voicevox_import.ts`
- `src/quality/schema_validator.ts`
- `tests/pipeline/stage4_stage5.test.ts`
- `tests/pipeline/stage4_unit.test.ts`

## 日常運用コマンド

```bash
# 型チェック
bun run typecheck

# テスト
bun test

# パイプライン実行
bun run build-all -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --run-dir projects/introducing-rescript/run-20260211-0000
```

PR/コミット前の最低ライン:

1. `bun run typecheck`
2. `bun test`

## CI チェック手順

GitHub Actions は `/.github/workflows/ci.yml` で定義済みです。  
`pull_request` と `main` への `push` をトリガーに、次を実行します。

1. `bun install --frozen-lockfile`
2. `bun run typecheck`
3. `bun test`

保護ルールを有効にする場合は、GitHub の Branch protection で `CI / typecheck-and-test` を必須ステータスに設定してください。

## 実装ルール

1. 新規コードは原則 `.ts` / `.test.ts` で作成する。
2. ローカル import は `.ts` 拡張子付きで記述する（現行 `tsconfig.json` は `allowImportingTsExtensions: true`）。
3. `JSON.parse` の戻り値は型注釈や `unknown` 経由で扱い、暗黙 `any` を避ける。
4. `bun run typecheck` をパスしない変更はマージしない。

## `tsconfig.json` の方針

現行は以下を採用:

- `strict: true`
- `noEmit: true`
- `allowImportingTsExtensions: true`
- `allowJs: true`
- `checkJs: true`

`allowJs` / `checkJs` は、将来 JS を一時混在させる余地を残す設定です。  
JS の再混在を禁止したい場合は、次の変更を別PRで実施してください。

```json
{
  "compilerOptions": {
    "allowJs": false,
    "checkJs": false
  }
}
```

## トラブルシュート

### `An import path can only end with a '.ts' extension ...`

- `tsconfig.json` に `allowImportingTsExtensions: true` があるか確認する。

### `Cannot find module ...`（型定義不足）

- `bun add -d @types/node @types/kuromoji typescript` を確認する。

### 型チェックは通るが実行が失敗する

- `bun run build-all -- ...` を再実行し、入力パスと `configs/voicevox` 配下のファイル存在を確認する。

## AI への依頼テンプレート（運用版）

```text
このリポジトリはTS移行済みです。TypeScript前提で修正してください。
必ず bun run typecheck と bun test を実行し、必要なら bun run build-all -- ... で実動作確認してください。
```
