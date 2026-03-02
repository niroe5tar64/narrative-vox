---
paths:
  - ".claude/agents/**/*.md"
  - ".claude/rules/**/*.md"
  - ".tmp/agent-teams/**/*.md"
  - ".tmp/renewal-spec/**/*.md"
---

# Agent Team Operating Model

renewal 実装では Claude Code Agent Teams を正式運用として使う。

## 正本

- プロダクト仕様の正本: `.tmp/renewal-spec/**`
- 実装進行の正本: Agent Teams の TaskList
- 指示と報告の正本: Agent Teams の Mailbox

repo 内 markdown はテンプレートと運用ルールの補助資料であり、進捗状態の正本ではない。

## 体制

- PM: 人間
- Director: 調整役
- Architect
- Designer
- Backend
- Frontend
- Code Reviewer
- QA
- Documentation

人間は specialist に直接作業依頼しない。PM は Director に story を渡す。

## 運用ルール

- 1 story = 1 branch
- 1 task = 1 commit
- 1 story = 1 PR
- mutating task は同時に 1 つしか進めない
- read-only role の並行調査は許可する
- `ready` でない task を実装しない
- `Decision-Free Checklist` が 1 項目でも未充足なら task を `ready` にしない

## task に必須の項目

- Spec Refs
- Scope Paths
- Inputs
- Outputs
- Success Conditions
- Failure Conditions
- Tests / Checks
- Depends On
- Decision-Free Checklist

## blocked 理由の種別

- `NEEDS_SPEC_DECISION`
- `NEEDS_DEPENDENCY`
- `ENVIRONMENT_ISSUE`

実装者は仕様不足を自分で決めず、`NEEDS_SPEC_DECISION` で Director に返す。

## 必須ゲート

### Architecture Gate

以下に触る task は architect signoff 必須。

- `schemas/`
- `packages/domain/`
- `packages/api-types/`
- `apps/api/` route contract
- `apps/cli/` command contract
- `packages/quality/`
- `packages/authoring/`
- `RunStatus`
- `ProjectConfig`
- `character-map`
- `check-run`

### Design Gate

以下に触る story は designer signoff 必須。

- `apps/web/` の視覚変更
- `PipelinePage`
- `ProjectEditorPane`
- `RunsPage`
- `.pen` 更新を伴う変更

### Review / QA / Docs Gate

story 完了前に以下を通す。

- code-reviewer
- qa
- documentation（必要な story のみ）
