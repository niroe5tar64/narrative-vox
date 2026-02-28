// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  CharacterConfig,
  GenreConfig,
  ProjectConfig,
  StyleConfig,
} from "@/api/client";
import { ProjectsPage } from "@/pages/configs/ProjectsPage";

const invalidateQueries = vi.fn(() => Promise.resolve());
const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const NativeRequest = globalThis.Request;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries }),
}));

function makeProject(projectId: string, title: string): ProjectConfig {
  return {
    GENRE_ID: "tech-explainer",
    PROJECT_ID: projectId,
    PROJECT_TITLE: title,
    SOURCE_MARKDOWN_PATHS: "data/inputs/*.md",
    AUDIENCE_BACKGROUND: "bg",
    AUDIENCE_LEVEL: "beginner",
    AUDIENCE_INTEREST: "interest",
    BASELINE_CONTEXT_OR_EMPTY: "",
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
    PROJECT_BLUEPRINT_JSON_PATH: "data/projects/demo/blueprint.json",
    EPISODE_ID: "E01",
    STYLE_ID: "radio-talk",
    CAST: { narrator: "narrator" },
  };
}

function makeCharacter(key: string): CharacterConfig {
  return {
    key,
    name: "Narrator",
    voice: {
      engineId: "engine-id",
      speakerId: "speaker-id",
      styleId: 0,
    },
    emotionStyles: {},
  };
}

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <div>
            <Link to="/other">go-other</Link>
            <Outlet />
          </div>
        ),
        children: [
          {
            path: "configs/pipeline/projects",
            element: <ProjectsPage />,
          },
          {
            path: "other",
            element: <div>Other Page</div>,
          },
        ],
      },
    ],
    {
      initialEntries: ["/configs/pipeline/projects"],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.AbortController = window.AbortController;
    globalThis.AbortSignal = window.AbortSignal;
    globalThis.Request = class RequestWithoutSignal extends NativeRequest {
      constructor(
        input: ConstructorParameters<typeof NativeRequest>[0],
        init?: ConstructorParameters<typeof NativeRequest>[1],
      ) {
        super(input, init ? { ...init, signal: undefined } : init);
      }
    } as typeof Request;

    const projects = [
      makeProject("alpha", "Alpha"),
      makeProject("beta", "Beta"),
    ];
    const genres: GenreConfig[] = [
      {
        genre_id: "tech-explainer",
        genre_name: "Tech Explainer",
        extra_fields: [],
      },
    ];
    const styles: StyleConfig[] = [
      {
        style_id: "radio-talk",
        style_name: "Radio Talk",
        format: {
          speaker_mode: "single",
          speaker_count: 1,
          speaker_roles: [{ role: "narrator", utterance_share: 1 }],
        },
      },
    ];
    const characters = [makeCharacter("narrator")];

    useQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const key = queryKey[0];
        if (key === "projects") {
          return { data: { items: projects }, isLoading: false };
        }
        if (key === "characters") {
          return { data: { items: characters }, isLoading: false };
        }
        if (key === "genres") {
          return { data: { items: genres }, isLoading: false };
        }
        if (key === "styles") {
          return { data: { items: styles }, isLoading: false };
        }
        return { data: undefined, isLoading: false };
      },
    );

    useMutationMock.mockImplementation(() => ({
      mutate: vi.fn(),
      isPending: false,
    }));
  });

  afterEach(() => {
    globalThis.Request = NativeRequest;
  });

  test("dirty なドラフトで別プロジェクトを選ぶと local confirm が開き、cancel でドラフトを維持する", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByText("New Project")).toBeTruthy();

    const projectIdInput = screen.getByPlaceholderText("e.g. my-project");
    fireEvent.change(projectIdInput, { target: { value: "draft-project" } });

    fireEvent.click(screen.getByRole("button", { name: /beta/i }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄して別のプロジェクトを開きますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄してページを移動しますか？"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "破棄して開く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(screen.getByText("New Project")).toBeTruthy();
    expect(screen.getByDisplayValue("draft-project")).toBeTruthy();
    expect(screen.queryByText("Edit: beta")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("dirty なドラフトで別プロジェクトを選び、confirm すると対象プロジェクトを開く", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. my-project"), {
      target: { value: "draft-project" },
    });

    fireEvent.click(screen.getByRole("button", { name: /beta/i }));
    fireEvent.click(screen.getByRole("button", { name: "破棄して開く" }));

    await waitFor(() => {
      expect(screen.getByText("Edit: beta")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("beta")).toBeTruthy();
    expect(screen.queryByText("New Project")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("dirty なドラフトで route 遷移すると dirty guard dialog が開き、local confirm ではない", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. my-project"), {
      target: { value: "draft-project" },
    });

    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄してページを移動しますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄して別のプロジェクトを開きますか？"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "破棄して移動" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "とどまる" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(screen.queryByText("Other Page")).toBeNull();
    expect(screen.getByText("New Project")).toBeTruthy();
    expect(screen.getByDisplayValue("draft-project")).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
