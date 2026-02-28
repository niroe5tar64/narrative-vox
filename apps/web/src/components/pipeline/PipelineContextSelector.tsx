import { Label } from "@/components/ui/label";

type ProjectItem = { PROJECT_ID: string };
type RunItem = { projectId: string; runId: string };

type Props = {
  projectId: string;
  runKey: string;
  episodeId: string;
  episodeOptions: string[];
  isDisabled: boolean;
  projects?: ProjectItem[];
  runs?: RunItem[];
  onProjectIdChange: (id: string) => void;
  onRunKeyChange: (key: string) => void;
  onEpisodeIdChange: (id: string) => void;
};

export function PipelineContextSelector({
  projectId,
  runKey,
  episodeId,
  episodeOptions,
  isDisabled,
  projects,
  runs,
  onProjectIdChange,
  onRunKeyChange,
  onEpisodeIdChange,
}: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur">
      <p className="text-xs font-medium text-slate-500">対象</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label>Project</Label>
          <select
            value={projectId}
            onChange={(e) => onProjectIdChange(e.target.value)}
            disabled={isDisabled}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">選択してください</option>
            {projects?.map((p) => (
              <option key={p.PROJECT_ID} value={p.PROJECT_ID}>
                {p.PROJECT_ID}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-48 flex-1 space-y-1.5">
          <Label>Run</Label>
          <select
            value={runKey}
            onChange={(e) => onRunKeyChange(e.target.value)}
            disabled={isDisabled}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">選択または空（新規）</option>
            {runs?.map((r) => (
              <option
                key={`${r.projectId}/${r.runId}`}
                value={`${r.projectId}/${r.runId}`}
              >
                {r.projectId} / {r.runId}
              </option>
            ))}
          </select>
        </div>

        <div className="w-28 space-y-1.5">
          <Label>Episode</Label>
          <select
            value={episodeId}
            onChange={(e) => onEpisodeIdChange(e.target.value)}
            disabled={isDisabled}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {episodeOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
