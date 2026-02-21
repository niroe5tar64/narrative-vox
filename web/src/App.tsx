import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { PagePlaceholder } from "@/pages/page-placeholder";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/configs/characters" /> },
      {
        path: "configs/characters",
        element: (
          <PagePlaceholder
            path="/configs/characters"
            title="Characters"
            description="キャラクター定義と音声スタイル設定の編集ページ。"
          />
        ),
      },
      {
        path: "configs/projects",
        element: (
          <PagePlaceholder
            path="/configs/projects"
            title="Projects"
            description="プロジェクト設定とエピソード管理の編集ページ。"
          />
        ),
      },
      {
        path: "configs/styles",
        element: (
          <PagePlaceholder
            path="/configs/styles"
            title="Styles"
            description="スタイル一覧の閲覧ページ。"
          />
        ),
      },
      {
        path: "configs/voicevox",
        element: (
          <PagePlaceholder
            path="/configs/voicevox"
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
        element: <Navigate replace to="/configs/characters" />,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
