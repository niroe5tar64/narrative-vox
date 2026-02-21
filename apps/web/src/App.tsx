import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { CharactersPage } from "@/pages/configs/CharactersPage";
import { DictionariesPage } from "@/pages/configs/DictionariesPage";
import { ProjectsPage } from "@/pages/configs/ProjectsPage";
import { StylesPage } from "@/pages/configs/StylesPage";
import { VoicevoxPage } from "@/pages/configs/VoicevoxPage";
import { PipelinePage } from "@/pages/pipeline/PipelinePage";
import { RunDetailPage } from "@/pages/runs/RunDetailPage";
import { RunsPage } from "@/pages/runs/RunsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/configs/content/characters" /> },
      {
        path: "configs/content/characters",
        element: <CharactersPage />,
      },
      {
        path: "configs/pipeline/projects",
        element: <ProjectsPage />,
      },
      {
        path: "configs/content/styles",
        element: <StylesPage />,
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
        element: <Navigate replace to="/configs/content/characters" />,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
