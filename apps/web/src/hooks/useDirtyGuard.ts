import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import type { ConfirmDialogProps } from "@/components/feedback/ConfirmDialog";

type DirtyGuardResult = {
  confirmDialogProps: ConfirmDialogProps;
};

const CLOSED_DIALOG: ConfirmDialogProps = {
  open: false,
  title: "未保存の変更があります",
  body: "変更を破棄してページを移動しますか？",
  confirmLabel: "破棄して移動",
  cancelLabel: "とどまる",
  onConfirm: () => {},
  onCancel: () => {},
};

/**
 * 未保存変更がある場合のページ離脱ガード。
 * - beforeunload: ブラウザタブを閉じる / リロードする際に警告
 * - useBlocker: SPA 内のルート変更時に in-app 確認ダイアログを表示
 */
export function useDirtyGuard(isDirty: boolean): DirtyGuardResult {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty && blocker.state === "blocked") {
      blocker.reset();
    }
  }, [blocker, blocker.state, isDirty]);

  if (blocker.state !== "blocked") {
    return { confirmDialogProps: CLOSED_DIALOG };
  }

  return {
    confirmDialogProps: {
      open: true,
      title: "未保存の変更があります",
      body: "変更を破棄してページを移動しますか？",
      confirmLabel: "破棄して移動",
      cancelLabel: "とどまる",
      onConfirm: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    },
  };
}
