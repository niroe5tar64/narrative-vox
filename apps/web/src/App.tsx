import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ContentPage } from "@/pages/configs/ContentPage";
import { DictionariesPage } from "@/pages/configs/DictionariesPage";
import { ProjectsPage } from "@/pages/configs/ProjectsPage";
import { VoicevoxPage } from "@/pages/configs/VoicevoxPage";
import { PipelinePage } from "@/pages/pipeline/PipelinePage";
import { RunDetailPage } from "@/pages/runs/RunDetailPage";
import { RunsPage } from "@/pages/runs/RunsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/configs/content" /> },
      {
        path: "configs/content",
        element: <ContentPage />,
      },
      {
        path: "configs/pipeline/projects",
        element: <ProjectsPage />,
      },
      {
        path: "configs/voice/voicevox",
        element: <VoicevoxPage />,
      },
      {
        path: "configs/dictionaries",
        element: <DictionariesPage />,
      },
      {
        path: "pipeline",
        element: <PipelinePage />,
      },
      {
        path: "runs",
        element: <RunsPage />,
      },
      {
        path: "runs/:projectId/:runId",
        element: <RunDetailPage />,
      },
      {
        path: "*",
        element: <Navigate replace to="/configs/content" />,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
