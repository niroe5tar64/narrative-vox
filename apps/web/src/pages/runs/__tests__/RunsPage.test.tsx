// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RunsPage } from "@/pages/runs/RunsPage";

const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <RunsPage />
    </MemoryRouter>,
  );
}

describe("RunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const [, projectIdFilter, page] = queryKey;

        if (projectIdFilter === "empty") {
          return {
            data: { items: [], total: 0, page: 1, pageSize: 20 },
            isLoading: false,
            error: null,
          };
        }

        if (projectIdFilter === "error") {
          return {
            data: undefined,
            isLoading: false,
            error: new Error("boom"),
          };
        }

        if (projectIdFilter === "demo") {
          return {
            data: {
              items: [
                {
                  projectId: "demo",
                  runId: "run-filtered",
                  createdAt: "2026-02-28T00:00:00.000Z",
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
            },
            isLoading: false,
            error: null,
          };
        }

        if (page === 2) {
          return {
            data: {
              items: [
                {
                  projectId: "demo",
                  runId: "run-021",
                  createdAt: "2026-02-28T00:00:00.000Z",
                },
              ],
              total: 25,
              page: 2,
              pageSize: 20,
            },
            isLoading: false,
            error: null,
          };
        }

        return {
          data: {
            items: [
              {
                projectId: "demo",
                runId: "run-001",
                createdAt: "2026-02-28T00:00:00.000Z",
              },
            ],
            total: 25,
            page: 1,
            pageSize: 20,
          },
          isLoading: false,
          error: null,
        };
      },
    );
  });

  test("table を描画し、次ページへ進むと結果が切り替わる", () => {
    renderPage();

    expect(screen.getByText("run-001")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(screen.getByText("run-021")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.queryByText("run-001")).toBeNull();
  });

  test("page 2 から filter を入れると page が 1 に戻り、filtered result に切り替わる", () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(screen.getByText("run-021")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Project ID でフィルタ..."), {
      target: { value: "demo" },
    });

    expect(screen.getByText("run-filtered")).toBeTruthy();
    expect(screen.queryByText("run-021")).toBeNull();
    expect(screen.queryByText("2 / 2")).toBeNull();
    expect(screen.getByRole("button", { name: "クリア" })).toBeTruthy();
  });

  test("filter clear で unfiltered page 1 に戻る", () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Project ID でフィルタ..."), {
      target: { value: "demo" },
    });
    expect(screen.getByText("run-filtered")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "クリア" }));

    expect(screen.getByText("run-001")).toBeTruthy();
    expect(screen.queryByText("run-filtered")).toBeNull();
    expect(screen.queryByRole("button", { name: "クリア" })).toBeNull();
  });

  test("empty state を表示する", () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Project ID でフィルタ..."), {
      target: { value: "empty" },
    });

    expect(screen.getByText("Run が見つかりません")).toBeTruthy();
  });

  test("error state を表示する", () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Project ID でフィルタ..."), {
      target: { value: "error" },
    });

    expect(screen.getByText("エラーが発生しました")).toBeTruthy();
  });
});
