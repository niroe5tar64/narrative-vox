// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";

const useBlockerMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useBlocker: (...args: unknown[]) => useBlockerMock(...args),
  };
});

type MockBlocker = {
  state: "unblocked" | "blocked" | "proceeding";
  proceed: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};

let blocker: MockBlocker;

beforeEach(() => {
  blocker = {
    state: "unblocked",
    proceed: vi.fn(),
    reset: vi.fn(),
  };
  useBlockerMock.mockImplementation(() => blocker);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDirtyGuard", () => {
  test("dirty でない場合は dialog を開かない", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderHook(() => useDirtyGuard(false));

    expect(useBlockerMock).toHaveBeenCalledWith(false);
    expect(result.current.confirmDialogProps.open).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("dirty + blocked の場合は in-app dialog を返し、confirm/cancel が blocker を操作する", () => {
    blocker.state = "blocked";
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderHook(() => useDirtyGuard(true));

    expect(useBlockerMock).toHaveBeenCalledWith(true);
    expect(result.current.confirmDialogProps.open).toBe(true);
    expect(result.current.confirmDialogProps.title).toBe("未保存の変更があります");

    result.current.confirmDialogProps.onCancel();
    expect(blocker.reset).toHaveBeenCalledTimes(1);

    result.current.confirmDialogProps.onConfirm();
    expect(blocker.proceed).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("blocked 中に dirty が解消されたら blocker を reset する", () => {
    blocker.state = "blocked";
    const { rerender } = renderHook(
      ({ isDirty }) => useDirtyGuard(isDirty),
      { initialProps: { isDirty: true } },
    );

    rerender({ isDirty: false });

    expect(blocker.reset).toHaveBeenCalledTimes(1);
  });

  test("dirty の場合は beforeunload を防止する", () => {
    renderHook(() => useDirtyGuard(true));

    const event = new Event("beforeunload", { cancelable: true });
    const prevented = !window.dispatchEvent(event);

    expect(event.defaultPrevented || prevented).toBe(true);
  });
});
