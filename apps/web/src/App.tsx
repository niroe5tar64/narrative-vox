import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { PagePlaceholder } from "@/pages/page-placeholder";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/configs/content/characters" /> },
      {
        path: "configs/content/characters",
        element: (
          <PagePlaceholder
            path="/configs/content/characters"
            title="Characters"
            description="キャラクター定義と音声スタイル設定の編集ページ。"
          />
        ),
      },
      {
        path: "configs/pipeline/projects",
        element: (
          <PagePlaceholder
            path="/configs/pipeline/projects"
            title="Projects"
            description="プロジェクト設定とエピソード管理の編集ページ。"
          />
        ),
      },
      {
        path: "configs/content/styles",
        element: (
          <PagePlaceholder
            path="/configs/content/styles"
            title="Styles"
            description="スタイル一覧の閲覧ページ。"
          />
        ),
      },
      {
        path: "configs/voice/voicevox",
        element: (
          <PagePlaceholder
            path="/configs/voice/voicevox"
            title="VOICEVOX Config"
            description="synthesis defaults、speed profile などを編集するページ。"
          />
        ),
      },
      {
        path: "configs/dictionaries",
        element: (
          <PagePlaceholder
            path="/configs/dictionaries"
            title="Dictionaries"
            description="reading dictionary と user dictionary を管理するページ。"
          />
        ),
      },
      {
        path: "pipeline",
        element: (
          <PagePlaceholder
            path="/pipeline"
            title="Pipeline"
            description="build-text / build-project / build-audio の実行コンソール。"
          />
        ),
      },
      {
        path: "runs",
        element: (
          <PagePlaceholder
            path="/runs"
            title="Runs"
            description="run一覧、成果物閲覧、検証実行を行うページ。"
          />
        ),
      },
      {
        path: "*",
        element: <Navigate replace to="/configs/content/characters" />,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
