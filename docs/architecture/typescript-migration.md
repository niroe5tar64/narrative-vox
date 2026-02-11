# TypeScript Migration Guide (AI実行前提)

## 結論

AI が修正を支援できても、移行手順書は必要です。  
理由は、`失敗時の復旧速度` と `再現性` が上がるためです。

このリポジトリは規模が小さいため、段階移行よりも「事前に型チェックを通しつつ、短時間で一括 `.ts` 化」が安全です。

## 対象範囲

- `src/cli/main.js`
- `src/pipeline/stage4_voicevox_text.js`
- `src/pipeline/stage5_voicevox_import.js`
- `src/quality/schema_validator.js`
- `tests/pipeline/stage4_stage5.test.js`
- `tests/pipeline/stage4_unit.test.js`

## 完了条件

- `bun run typecheck` が成功する
- `bun test` が成功する
- `bun run pipeline -- ...` で Stage4/5 の出力が従来同等になる

## 移行方針

1. 先に TypeScript の型チェック基盤を入れる（`allowJs` で共存）
2. JS のまま型エラーを減らす（必要に応じて JSDoc 補助）
3. 最後に対象ファイルを一括で `.ts` へ変更
4. 実行コマンド・import 拡張子・テストをまとめて整合

この順序にすると、AI が途中で誤修正しても戻しやすくなります。

## 実施手順

### 0. ベースライン確保

```bash
git status
bun test
```

任意で、既知入力に対する出力を保存して比較基準を作る:

```bash
bun run pipeline -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --out-dir projects/introducing-rescript/run-20260211-0000
```

### 1. TypeScript 基盤を追加

```bash
bun add -d typescript @types/node @types/kuromoji
```

`tsconfig.json` を追加（未作成なら）:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

`package.json` に型チェック script を追加:

```json
{
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

### 2. JS共存状態で型エラーを潰す

```bash
bun run typecheck
```

ここでの対応例:

- `Map` や `options` の型が曖昧な箇所に JSDoc を追加
- `JSON.parse` 結果を `unknown` 扱いにして必要最小限で絞る
- `kuromoji` の動的 import 部分に narrow/cast を入れる

この段階で `bun run typecheck` と `bun test` が通る状態にする。

### 3. 一括 `.ts` 化

対象ファイルを `.js` から `.ts` に変更し、ローカル import を `.ts` 参照へ更新する。

変更対象:

- `src/cli/main.ts`
- `src/pipeline/stage4_voicevox_text.ts`
- `src/pipeline/stage5_voicevox_import.ts`
- `src/quality/schema_validator.ts`
- `tests/pipeline/stage4_stage5.test.ts`
- `tests/pipeline/stage4_unit.test.ts`

`package.json` の実行 script も更新:

```json
{
  "scripts": {
    "stage4": "bun src/cli/main.ts stage4",
    "stage5": "bun src/cli/main.ts stage5",
    "pipeline": "bun src/cli/main.ts pipeline"
  }
}
```

### 4. 最終検証

```bash
bun run typecheck
bun test
bun run pipeline -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --out-dir projects/introducing-rescript/run-20260211-0000
```

確認ポイント:

- 出力ファイル名・JSON 構造が変わっていない
- `run_id` 推論と `--run-id` バリデーションが従来通り
- 辞書候補（`dictionary_candidates`）の抽出数が極端に変化していない

## 失敗時の戻し方

段階ごとにコミットしておくと、次の単位で戻せます。

1. `chore(ts): 型チェック基盤追加`
2. `refactor(ts): JS共存で型エラー解消`
3. `refactor(ts): 本体とテストを.tsへ移行`

一時的に詰まった場合は、`.ts` 化を戻すのではなく `allowJs: true` の状態に戻して再開する方が速いです。

## AIに依頼する時の最小プロンプト

```text
このリポジトリを docs/architecture/typescript-migration.md の手順に従ってTS化してください。
フェーズごとに bun run typecheck / bun test を実行し、失敗時は原因と修正を反映して継続してください。
最後に変更ファイル一覧と検証結果を報告してください。
```
