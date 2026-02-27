import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  isRunningBuildAll: boolean;
  canRunBuildAll: boolean;
  disabledReason?: string | null;
  onRunBuildAll: () => void;
  onCancel: () => void;
};

export function PipelineShortcutPanel({
  isRunningBuildAll,
  canRunBuildAll,
  disabledReason,
  onRunBuildAll,
  onCancel,
}: Props) {
  return (
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-400">ショートカット</p>
      <div className="flex flex-wrap items-center gap-2">
        {isRunningBuildAll ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onCancel}
            className="cursor-pointer gap-1.5 text-red-600 hover:text-red-700"
          >
            <Square className="size-3.5" />
            停止
          </Button>
        ) : (
          <span title={!canRunBuildAll ? disabledReason ?? undefined : undefined}>
            <Button
              size="sm"
              onClick={onRunBuildAll}
              disabled={!canRunBuildAll}
              className="cursor-pointer gap-1.5"
            >
              <Play className="size-3.5" />
              ステップ ⑤⑥⑦ をまとめて実行
            </Button>
          </span>
        )}
        <span className="text-xs text-slate-400">
          ※ ステップ⑧（音声合成）は別途実行が必要
        </span>
      </div>
    </div>
  );
}
