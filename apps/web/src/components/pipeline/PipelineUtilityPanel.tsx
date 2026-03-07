import { Button } from "@/components/ui/button";

type Paths = {
  runDir: string;
};

type Props = {
  paths: Paths | null;
  isAnyStepRunning: boolean;
  onRunUtil: (command: string, args: string[]) => void;
};

export function PipelineUtilityPanel({
  paths,
  isAnyStepRunning,
  onRunUtil,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur">
      <p className="mb-3 text-xs font-medium text-slate-500">ユーティリティ</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="cursor-pointer"
          onClick={() =>
            paths && onRunUtil("check-run", ["--run-dir", paths.runDir])
          }
          disabled={!paths || isAnyStepRunning}
        >
          run を検証
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="cursor-pointer"
          onClick={() => onRunUtil("dict-sync", [])}
          disabled={isAnyStepRunning}
        >
          辞書同期
        </Button>
      </div>
    </div>
  );
}
