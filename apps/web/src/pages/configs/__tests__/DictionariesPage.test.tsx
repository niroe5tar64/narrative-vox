// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DictionariesPage } from "@/pages/configs/DictionariesPage";

const NativeRequest = globalThis.Request;

vi.mock("@/components/configs/dictionaries/UserDictSection", () => ({
  UserDictSection: ({
    onDirtyChange,
  }: {
    onDirtyChange: (dirty: boolean) => void;
  }) => (
    <div>
      <div>UserDictSection</div>
      <button type="button" onClick={() => onDirtyChange(true)}>
        mark-dirty
      </button>
      <button type="button" onClick={() => onDirtyChange(false)}>
        clear-dirty
      </button>
    </div>
  ),
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
            path: "dictionaries",
            element: <DictionariesPage />,
          },
          {
            path: "other",
            element: <div>Other Page</div>,
          },
        ],
      },
    ],
    {
      initialEntries: ["/dictionaries"],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("DictionariesPage", () => {
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

  test("clean 状態では route 遷移をそのまま許可する", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    expect(screen.getByText("Dictionaries")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    await waitFor(() => {
      expect(screen.getByText("Other Page")).toBeTruthy();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("dirty 状態では cancel で現在ページに留まる", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄してページを移動しますか？"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "とどまる" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(screen.getByText("Dictionaries")).toBeTruthy();
    expect(screen.queryByText("Other Page")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("dirty 状態では confirm で route 遷移する", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "破棄して移動" }));

    await waitFor(() => {
      expect(screen.getByText("Other Page")).toBeTruthy();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
