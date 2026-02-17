---
name: git-split-commit-ja
description: 大きな変更を意味のある単位に分割して複数コミットへ整理し、各コミットを Conventional Commits の prefix 付き日本語 subject で作成する。ユーザーが「差分を小分けでコミットしたい」「変更を目的ごとに分割したい」「大規模diffを安全に複数コミット化したい」と依頼したときに使う。
---

# Git Split Commit JA

## 目的

- 大きな差分を目的別の小さなコミットへ分割する。
- すべてのコミットで `type: 日本語subject` 形式を満たす。
- 履歴の可読性を上げつつ、過剰な全文精読を避ける。

## 事前条件

- Gitリポジトリ配下で実行する。
- コンフリクト解消中（`MERGE_HEAD` あり）や rebase 中は分割コミットを実行しない。
- 破壊的操作（`reset --hard` など）を使わない。

## 実行フロー

### Step 1: 変更棚卸し（軽量）

- まず `scripts/split_inspect.sh` を実行する。
- 必要に応じて以下を使い、変更規模と偏りだけを確認する。
  - `git status --short`
  - `git diff --name-only`
  - `git diff --shortstat`
  - `git diff --stat`
  - `git diff --name-status`

### Step 2: 分割計画を作る

- 2〜7コミットを目安に、目的ごとの分割案を作成する。
- 各コミット案に以下を定義する。
  - `type`
  - 日本語subject
  - 対象ファイル
  - 目的（なぜ分けるか）
- 1つのファイルに複数目的が混在する場合、`hunk split` が必要と明記する。

### Step 3: 実行前確認

- 分割計画を短く提示し、ユーザー確認を取る。
- ユーザー確認前に `git add` `git reset` `git commit` を実行しない。

### Step 4: コミットを順に作る

- 実行開始時に、必要なら `git reset` で index のみ初期化する（ワークツリーは保持）。
- コミット案ごとに以下を実行する。

1. 対象変更をステージ
- ファイル単位: `git add -- <file...>`
- hunk単位: `git add -p -- <file>`

2. ステージ内容を確認
- `git diff --cached --name-only`
- `git diff --cached --shortstat`
- 必要なファイルだけ `git diff --cached -- <file>`

3. メッセージを作成してコミット
- 1行目を `<type>: <日本語subject>` にする。
- 実行時は必ず `scripts/ai_commit.sh` を使う。

```bash
skills/git-split-commit-ja/scripts/ai_commit.sh <<'__COMMIT__'
<type>: <subject>

- 必要なら本文
__COMMIT__
```

4. 記録
- `git rev-parse --short HEAD` を控える。

### Step 5: 仕上げ

- すべての変更がコミット済みか `git status --short` で確認する。
- 残差分があれば、計画漏れとして扱い、追加コミット案を1つだけ提示する。

## 分割ルール

- 優先順位: `機能追加` / `バグ修正` / `設計変更` / `テスト` / `整形・雑務`。
- 自動整形だけの差分は `style` または `chore` へ分離する。
- 振る舞い変更と整形変更は同一コミットに混在させない。
- 変更が密結合で分離困難なら、理由を明示して1コミットへ統合する。

## 禁止事項

- `git reset --hard` などの破壊的コマンド。
- 履歴改変（rebase, amend, force push）の提案または実行。
- コミット後に実装作業を継続すること。

## 完了報告

- 作成したコミットを時系列で簡潔に列挙する。
- 各行に `commit id` と `subject` のみ記載する。
