import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import type { ReactNode } from "react";

import { PageErrorBoundary } from "@/components/feedback/PageErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { ContentPage } from "@/pages/configs/ContentPage";
import { DictionariesPage } from "@/pages/configs/DictionariesPage";
import { ProjectsPage } from "@/pages/configs/ProjectsPage";
import { VoicevoxPage } from "@/pages/configs/VoicevoxPage";
import { PipelinePage } from "@/pages/pipeline/PipelinePage";
import { RunDetailPage } from "@/pages/runs/RunDetailPage";
import { RunsPage } from "@/pages/runs/RunsPage";

function withErrorBoundary(element: ReactNode) {
  return <PageErrorBoundary>{element}</PageErrorBoundary>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/configs/content" /> },
      {
        path: "configs/content",
        element: withErrorBoundary(<ContentPage />),
      },
      {
        path: "configs/pipeline/projects",
        element: withErrorBoundary(<ProjectsPage />),
      },
      {
        path: "configs/voice/voicevox",
        element: withErrorBoundary(<VoicevoxPage />),
      },
      {
        path: "configs/dictionaries",
        element: withErrorBoundary(<DictionariesPage />),
      },
      {
        path: "pipeline",
        element: withErrorBoundary(<PipelinePage />),
      },
      {
        path: "runs",
        element: withErrorBoundary(<RunsPage />),
      },
      {
        path: "runs/:projectId/:runId",
        element: withErrorBoundary(<RunDetailPage />),
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
