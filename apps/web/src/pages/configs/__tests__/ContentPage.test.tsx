// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { ContentPage } from "@/pages/configs/ContentPage";

vi.mock("@/components/configs/CharactersPanel", () => ({
  CharactersPanel: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div>
      <div>CharactersPanel</div>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        mark-dirty
      </button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>
        clear-dirty
      </button>
    </div>
  ),
}));

vi.mock("@/components/configs/StylesPanel", () => ({
  StylesPanel: () => <div>StylesPanel</div>,
}));

vi.mock("@/components/configs/GenrePanel", () => ({
  GenrePanel: () => <div>GenrePanel</div>,
}));

describe("ContentPage", () => {
  test("clean 状態ではタブ切り替えが即時に反映される", () => {
    render(<ContentPage />);

    expect(screen.getByText("CharactersPanel")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Styles" }));
    expect(screen.getByText("StylesPanel")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("CharactersPanel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Genre" }));
    expect(screen.getByText("GenrePanel")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("StylesPanel")).toBeNull();
  });

  test("dirty 状態では別タブ切り替え時に confirm dialog が開き、cancel で現在タブに留まる", async () => {
    render(<ContentPage />);

    expect(screen.getByText("CharactersPanel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Styles" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("未保存の変更があります")).toBeTruthy();
    expect(
      screen.getByText("変更を破棄してタブを切り替えますか？"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "破棄して切り替え" }),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄してページを移動しますか？"),
    ).toBeNull();
    expect(
      screen.queryByText("変更を破棄して別のキャラクターを開きますか？"),
    ).toBeNull();
    expect(
      screen.queryByText("変更を破棄して別のプロジェクトを開きますか？"),
    ).toBeNull();
    expect(screen.getByText("CharactersPanel")).toBeTruthy();
    expect(screen.queryByText("StylesPanel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(screen.getByText("CharactersPanel")).toBeTruthy();
    expect(screen.queryByText("StylesPanel")).toBeNull();
  });

  test("dirty 状態では confirm で対象タブへ切り替わる", async () => {
    render(<ContentPage />);

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Genre" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "破棄して切り替え" }));

    await waitFor(() => {
      expect(screen.getByText("GenrePanel")).toBeTruthy();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("CharactersPanel")).toBeNull();
    expect(screen.queryByText("StylesPanel")).toBeNull();
  });

  test("dirty 解除後は confirm なしで切り替わる", () => {
    render(<ContentPage />);

    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Styles" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("StylesPanel")).toBeTruthy();
    expect(screen.queryByText("CharactersPanel")).toBeNull();
  });
});
