import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type StepStatus = "idle" | "running" | "done" | "error";

type Step = {
  key: string;
  label: string;
  note: string;
};

type Props = {
  title: string;
  steps: readonly Step[];
  numberingOffset?: number;
  getStepStatus: (stepKey: string) => StepStatus;
  canRunStep: (stepKey: string) => boolean;
  isNextStep: (index: number, stepKey: string) => boolean;
  onRunStep: (stepKey: string) => void;
  onCancel: () => void;
  commandForStep: (stepKey: string) => string | null;
  copiedStep: string | null;
  onCopyStep: (stepKey: string, command: string) => void;
  onPreviewCommand: (command: string | null) => void;
};

export function PipelineStepList({
  title,
  steps,
  numberingOffset = 0,
  getStepStatus,
  canRunStep,
  isNextStep,
  onRunStep,
  onCancel,
  commandForStep,
  copiedStep,
  onCopyStep,
  onPreviewCommand,
}: Props) {
  return (
    <div className="space-y-1 rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur">
      <p className="mb-3 text-xs font-medium text-slate-500">{title}</p>

      <ul className="m-0 list-none space-y-1 p-0">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step.key);
          const isRunningThis = stepStatus === "running";
          const canRun = canRunStep(step.key);
          const showNext = isNextStep(index, step.key);
          const commandString = commandForStep(step.key);

          return (
            <li
              key={step.key}
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
              onMouseEnter={() => onPreviewCommand(commandString)}
              onMouseLeave={() => onPreviewCommand(null)}
            >
              <div className="shrink-0">
                {stepStatus === "done" ? (
                  <CheckCircle2 className="size-4.5 text-emerald-500" />
                ) : stepStatus === "error" ? (
                  <XCircle className="size-4.5 text-red-500" />
                ) : stepStatus === "running" ? (
                  <Loader2 className="size-4.5 animate-spin text-blue-500" />
                ) : (
                  <Circle className="size-4.5 text-slate-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">
                    {String(index + numberingOffset + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    {step.label}
                  </span>
                  {showNext && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                      次のステップ
                    </span>
                  )}
                  {stepStatus === "error" && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      エラー
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{step.note}</p>
              </div>

              {commandString && (
                <button
                  type="button"
                  className="shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyStep(step.key, commandString);
                  }}
                >
                  {copiedStep === step.key ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4 text-slate-400 hover:text-slate-600" />
                  )}
                </button>
              )}

              <div className="w-[4.5rem] shrink-0">
                {isRunningThis ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onCancel}
                    className="w-full cursor-pointer gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <Square className="size-3" />
                    停止
                  </Button>
                ) : stepStatus === "done" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRunStep(step.key)}
                    disabled={!canRun}
                    className="w-full cursor-pointer gap-1 text-xs text-slate-500"
                  >
                    <RotateCcw className="size-3" />
                    再実行
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onRunStep(step.key)}
                    disabled={!canRun}
                    className="w-full cursor-pointer gap-1 text-xs"
                  >
                    <Play className="size-3" />
                    実行
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
