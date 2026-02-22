# apps/web

Narrative Vox のフロントエンド GUI（Vite + React + TypeScript）。

## 技術スタック

- Vite + React + TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- React Router

## ディレクトリ構成

```
src/
  components/
    ui/        # shadcn/ui 生成コンポーネント（kebab-case）
    layout/    # レイアウト系コンポーネント
    configs/   # 設定画面用コンポーネント
    pipeline/  # パイプライン実行用コンポーネント
    runs/      # Run 一覧・詳細用コンポーネント
  pages/       # ページコンポーネント
  lib/         # ユーティリティ
```

## ファイル命名規約

- **`components/ui/`** — kebab-case（例: `button.tsx`, `input.tsx`）
  - shadcn/ui CLI が生成・更新するファイル群。shadcn/ui の公式規約に合わせて kebab-case のまま維持する。手動でリネームすると CLI 再生成時に上書きが壊れる。
- **それ以外のコンポーネント** — UpperCamelCase（例: `AppShell.tsx`, `RunsPage.tsx`）

## 開発

```bash
bun run dev          # 開発サーバー起動
bun run build        # ビルド
bun run typecheck    # 型チェック
```
