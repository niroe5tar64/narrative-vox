import { Plus } from "lucide-react";

import type { ProjectConfig } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Props = {
  projects: ProjectConfig[];
  selected: string | null;
  isNew: boolean;
  isLoading: boolean;
  onSelect: (project: ProjectConfig) => void;
  onStartNew: () => void;
};

export function ProjectsListPane({
  projects,
  selected,
  isNew,
  isLoading,
  onSelect,
  onStartNew,
}: Props) {
  return (
    <div className="flex w-60 flex-shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Projects</h2>
        <Button size="sm" onClick={onStartNew}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {projects.map((proj) => (
            <button
              key={proj.PROJECT_ID}
              type="button"
              onClick={() => onSelect(proj)}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors",
                selected === proj.PROJECT_ID && !isNew
                  ? "bg-emerald-600 text-white"
                  : "hover:bg-slate-100",
              )}
            >
              <div className="font-medium">{proj.PROJECT_ID}</div>
              <div className="text-xs opacity-60">{proj.PROJECT_TITLE}</div>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">
              No projects
            </p>
          )}
        </div>
      )}
    </div>
  );
}
