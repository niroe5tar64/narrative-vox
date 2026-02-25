import type { ReactNode } from "react";

type Props = {
  rightContent: ReactNode;
};

export function PipelineHeader({ rightContent }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Pipeline</h1>
      <div className="mt-1 flex shrink-0 items-center gap-1.5 text-xs">
        {rightContent}
      </div>
    </div>
  );
}
