---
name: git-commit-ja-prefix
description: ステージ済み変更から軽量な手順でコミットメッセージを生成し、Conventional Commits の prefix 付き日本語 subject でコミットする。ユーザーがコミット実行を依頼したとき、/commit 相当の挙動を求めたとき、または AI のコミット文面を規約で統一したいときに使う。
---

# Git Commit JA Prefix

## 目的

- ステージ済み変更から、低コストな確認手順でコミットメッセージを作成する。
- 1行目を `<type>: <日本語subject>` 形式に統一する。
- コミット作成だけを行い、コミット後は即終了する。

## このSkillの責務

このSkillの責務は「コミットメッセージを生成してコミットすること」のみ。

- 使用ツールを `git status` `git diff` `git log` `git commit` に限定する。
- コミット後に実装・編集・レビュー・次ステップ提案をしない。
- `TodoWrite` やファイル編集をしない。

## 入力

- ユーザーの追加メッセージ（任意）を subject と本文に反映する。

## コミットメッセージ形式

1行目:

- `<type>: <subject>`
- `type`: `feat` `fix` `refactor` `docs` `style` `test` `chore` `perf`
- `subject`: 日本語で簡潔に要約する。

本文（必要時のみ）:

- 箇条書きで「何を」「なぜ」を短く書く。
- 自明な整形だけなら省略する。

フッター（必要時のみ）:

- `Co-Authored-By: ...` を付ける。

## 実行手順

### Step 1: 軽量確認

- `git status` でステージ有無を確認する。ステージが無ければ報告して終了する。
- `git diff --cached --name-only` で変更ファイル一覧を取得する。
- `git diff --cached --shortstat` で変更規模を把握する。
- `git diff --cached --stat` で変更の偏りを確認する。

### Step 2: 読む範囲を決める

- 原則として `git diff --cached -- <file>` で必要ファイルのみ読む。
- `git diff --cached`（ファイル指定なし）の実行を禁止する。

小規模（目安）:

- 変更ファイル 1〜5、かつ差分量が小さい。
- 対象ファイルを順に確認する。

中〜大規模（目安）:

- 変更ファイル 6以上、または差分量が大きい。
- 要約モードに切り替える。

### Step 3: 要約モード

- `git diff --cached --name-status` で A/M/D/R を確認する。
- 変更の核となるファイルを最大3つ選び、そのファイルだけ `git diff --cached -- <file>` を読む。
- 残りは断定できる範囲のみ本文へ反映する。

### Step 4: 履歴参照（任意）

- 必要時のみ `git log --oneline -3` で文体を確認する。

### Step 5: 1コミットに収まるか判定

- 複数目的の変更が混在し subject が曖昧になる場合、コミットを実行しない。
- 代わりに `git reset -p` / `git add -p` で分割を提案して終了する。
- ユーザーが「今回はまとめてOK」と明示した場合のみ1コミットで進める。

### Step 6: 実行

- 実行前に、作成したコミットメッセージをチャットで短く提示する。
- 実行時は必ず `scripts/ai_commit.sh` を使って検証付きでコミットする。

```bash
skills/git-commit-ja-prefix/scripts/ai_commit.sh <<'EOF'
<type>: <subject>

- 変更点（必要なら）

Co-Authored-By: <co-author>
EOF
```

## 完了条件

- コミット完了後は、コミットIDと変更ファイル数のみ簡潔に報告して終了する。
- コミット作成以外の行動を行わない。
