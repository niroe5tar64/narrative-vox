// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryRouter,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CharacterConfig } from "@/api/client";
import { CharactersPanel } from "@/components/configs/CharactersPanel";

const invalidateQueries = vi.fn(() => Promise.resolve());
const useQueryMock = vi.fn();
const useQueriesMock = vi.fn();
const useMutationMock = vi.fn();
const NativeRequest = globalThis.Request;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
  useQueries: (options: unknown) => useQueriesMock(options),
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries }),
}));

function makeCharacter(key: string, name: string): CharacterConfig {
  return {
    key,
    name,
    voice: {
      engineId: "engine-id",
      speakerId: "speaker-id",
      styleId: 0,
    },
    emotionStyles: {},
  };
}

function renderPanel(onDirtyChange = vi.fn()) {
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
            path: "characters",
            element: <CharactersPanel onDirtyChange={onDirtyChange} />,
          },
          {
            path: "other",
            element: <div>Other Page</div>,
          },
        ],
      },
    ],
    {
      initialEntries: ["/characters"],
    },
  );

  render(<RouterProvider router={router} />);
  return { router, onDirtyChange };
}

describe("CharactersPanel", () => {
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

    const characters = [
      makeCharacter("alice", "Alice Character"),
      makeCharacter("bob", "Bob Character"),
    ];

    useQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const key = queryKey[0];
        if (key === "characters") {
          return { data: { items: characters }, isLoading: false, isError: false };
        }
        if (key === "voicevox-status") {
          return { data: undefined, isLoading: false, isError: false };
        }
        if (key === "voicevox-speakers") {
          return { data: undefined, isLoading: false, isError: false };
        }
        return { data: undefined, isLoading: false, isError: false };
      },
    );

    useQueriesMock.mockReturnValue([]);

    useMutationMock.mockImplementation(() => ({
      mutate: vi.fn(),
      isPending: false,
    }));
  });

  afterEach(() => {
    globalThis.Request = NativeRequest;
  });

  test("dirty な新規ドラフトで別キャラクターを選ぶと local confirm が開き、cancel でドラフトを維持する", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onDirtyChange = vi.fn();

    renderPanel(onDirtyChange);

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByText("New Character")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Key"), {
      target: { value: "draft-char" },
    });

    fireEvent.click(screen.getByText("Bob Character").closest("button") as HTMLButtonElement);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄して別のキャラクターを開きますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄してページを移動しますか？"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "破棄して開く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(screen.getByText("New Character")).toBeTruthy();
    expect(screen.getByDisplayValue("draft-char")).toBeTruthy();
    expect(screen.queryByText("Edit: bob")).toBeNull();
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("dirty な新規ドラフトで別キャラクターを選び、confirm すると対象キャラクターを開く", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByLabelText("Key"), {
      target: { value: "draft-char" },
    });

    fireEvent.click(screen.getByText("Bob Character").closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "破棄して開く" }));

    await waitFor(() => {
      expect(screen.getByText("Edit: bob")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("bob")).toBeTruthy();
    expect(screen.queryByText("New Character")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("dirty な新規ドラフトで route 遷移すると dirty guard dialog が開き、confirm で遷移する", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByLabelText("Key"), {
      target: { value: "draft-char" },
    });

    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄してページを移動しますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄して別のキャラクターを開きますか？"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "破棄して移動" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "破棄して移動" }));

    await waitFor(() => {
      expect(screen.getByText("Other Page")).toBeTruthy();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
