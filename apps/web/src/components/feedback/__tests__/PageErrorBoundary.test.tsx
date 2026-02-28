// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageErrorBoundary } from "@/components/feedback/PageErrorBoundary";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageErrorBoundary", () => {
  test("子コンポーネントのレンダー例外時にフォールバック UI を表示する", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const Throwing = () => {
      throw new Error("boom");
    };

    render(
      <PageErrorBoundary>
        <Throwing />
      </PageErrorBoundary>,
    );

    expect(
      screen.getByText("ページの表示中にエラーが発生しました"),
    ).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("Retry で再描画できる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const CrashOnDemand = () => {
      const [shouldThrow, setShouldThrow] = useState(false);
      if (shouldThrow) {
        throw new Error("first render failed");
      }
      return (
        <div>
          <span>Recovered</span>
          <button type="button" onClick={() => setShouldThrow(true)}>
            Crash
          </button>
        </div>
      );
    };

    render(
      <PageErrorBoundary>
        <CrashOnDemand />
      </PageErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Crash" }));
    expect(
      screen.getByText("ページの表示中にエラーが発生しました"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Recovered")).toBeTruthy();
  });
});
