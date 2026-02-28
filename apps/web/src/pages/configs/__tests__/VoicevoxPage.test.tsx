// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VoicevoxPage } from "@/pages/configs/VoicevoxPage";

const NativeRequest = globalThis.Request;

vi.mock("@/components/configs/voicevox/SynthesisDefaultsEditor", () => ({
  SynthesisDefaultsEditor: ({
    onDirtyChange,
  }: {
    configName: string;
    onDirtyChange: (dirty: boolean) => void;
  }) => (
    <div>
      <div>SynthesisDefaultsEditor</div>
      <button type="button" onClick={() => onDirtyChange(true)}>
        mark-dirty
      </button>
      <button type="button" onClick={() => onDirtyChange(false)}>
        clear-dirty
      </button>
    </div>
  ),
}));

vi.mock("@/components/configs/voicevox/SpeedProfilesEditor", () => ({
  SpeedProfilesEditor: () => <div>SpeedProfilesEditor</div>,
}));

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
            path: "configs/voice/voicevox",
            element: <VoicevoxPage />,
          },
          {
            path: "other",
            element: <div>Other Page</div>,
          },
        ],
      },
    ],
    {
      initialEntries: ["/configs/voice/voicevox"],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("VoicevoxPage", () => {
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
  });

  afterEach(() => {
    globalThis.Request = NativeRequest;
  });

  test("clean 状態では Speed Profiles へ即時切り替わる", () => {
    renderPage();

    expect(screen.getByText("SynthesisDefaultsEditor")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Speed Profiles" }));

    expect(screen.getByText("SpeedProfilesEditor")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("SynthesisDefaultsEditor")).toBeNull();
  });

  test("dirty 状態で tab 切り替えすると local confirm が開き、cancel で留まる", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Speed Profiles" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄してタブを切り替えますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄してページを移動しますか？"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(screen.getByText("SynthesisDefaultsEditor")).toBeTruthy();
    expect(screen.queryByText("SpeedProfilesEditor")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("dirty 状態で tab 切り替えを confirm すると対象 tab に移る", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Speed Profiles" }));
    fireEvent.click(screen.getByRole("button", { name: "破棄して切り替え" }));

    await waitFor(() => {
      expect(screen.getByText("SpeedProfilesEditor")).toBeTruthy();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("SynthesisDefaultsEditor")).toBeNull();
  });

  test("dirty 状態で route 遷移すると dirty guard dialog が開き、confirm で遷移する", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByText("変更を破棄してページを移動しますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄してタブを切り替えますか？"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "破棄して移動" }));

    await waitFor(() => {
      expect(screen.getByText("Other Page")).toBeTruthy();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
