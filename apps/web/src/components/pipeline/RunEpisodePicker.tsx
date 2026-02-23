import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  runKey: string;
  episodeId: string;
  onRunKeyChange: (runKey: string) => void;
  onEpisodeIdChange: (episodeId: string) => void;
  disabled: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunEpisodePicker({
  runKey,
  episodeId,
  onRunKeyChange,
  onEpisodeIdChange,
  disabled,
}: Props) {
  const { data } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list({ pageSize: 20 }),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-wrap gap-2 items-end">
      {/* Run select */}
      <div className="flex-1 min-w-48 space-y-1.5">
        <Label>Run</Label>
        <select
          value={runKey}
          onChange={(e) => onRunKeyChange(e.target.value)}
          disabled={disabled}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">選択してください</option>
          {data?.items.map((r) => (
            <option
              key={`${r.projectId}/${r.runId}`}
              value={`${r.projectId}/${r.runId}`}
            >
              {r.projectId} / {r.runId}
            </option>
          ))}
        </select>
      </div>

      {/* Episode ID input */}
      <div className="w-24 space-y-1.5">
        <Label>Episode</Label>
        <Input
          value={episodeId}
          onChange={(e) => onEpisodeIdChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
