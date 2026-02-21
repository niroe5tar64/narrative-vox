import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * 未保存変更がある場合のページ離脱ガード。
 * - beforeunload: ブラウザタブを閉じる / リロードする際に警告
 * - useBlocker: SPA 内のルート変更時に確認ダイアログを表示
 */
export function useDirtyGuard(isDirty: boolean) {
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
    if (blocker.state !== "blocked") return;
    if (window.confirm("未保存の変更があります。ページを離れますか？")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);
}
