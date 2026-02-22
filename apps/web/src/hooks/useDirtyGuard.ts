import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/**
 * 未保存変更がある場合のページ離脱ガード。
 * - beforeunload: ブラウザタブを閉じる / リロードする際に警告
 * - useBlocker: SPA 内のルート変更時に確認ダイアログを表示
 *
 * useBlocker にコールバック形式で shouldBlock を渡し、
 * ナビゲーション判定と同じ同期コンテキストで window.confirm を表示する。
 * React 19 の並行レンダリングによる useEffect の非同期実行では
 * ダイアログが抑制される場合があるため、この方法を採用している。
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

  // useRef で isDirty の最新値を保持し、コールバック内での stale closure を防ぐ
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // ナビゲーション判定をコールバックとして渡すことで、
  // ルーターのナビゲーションイベントと同期的に確認ダイアログを表示する
  const shouldBlock = useCallback(() => {
    if (!isDirtyRef.current) return false;
    return !window.confirm("未保存の変更があります。ページを離れますか？");
  }, []);

  const blocker = useBlocker(shouldBlock);

  // shouldBlock が true を返したとき、ルーターは blocker を "blocked" に遷移させる。
  // ダイアログは shouldBlock 内で処理済みのため、ここではリセットのみ行う。
  useEffect(() => {
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  }, [blocker.state, blocker]);
}
