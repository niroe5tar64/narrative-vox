import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  command: string;
  onApply: (options: Record<string, string>) => void;
  disabled: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunEpisodePicker({ command, onApply, disabled }: Props) {
  const [runKey, setRunKey] = useState("");
  const [episodeId, setEpisodeId] = useState("E01");

  const { data } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list({ pageSize: 20 }),
    staleTime: 30_000,
  });

  const handleApply = () => {
    if (!runKey) return;
    const slashIdx = runKey.indexOf("/");
    const projectId = runKey.slice(0, slashIdx);
    const runId = runKey.slice(slashIdx + 1);
    const base = `data/projects/${projectId}/${runId}`;
    const opts: Record<string, string> = {};
    switch (command) {
      case "build-text":
      case "build-all":
        opts["--script"] = `${base}/script/${episodeId}_script.md`;
        break;
      case "patch-voicevox-text":
      case "build-project":
        opts["--voicevox-text-json"] = `${base}/voicevox_text/${episodeId}_voicevox_text.json`;
        break;
      case "build-audio":
        opts["--vvproj"] = `${base}/voicevox_project/${episodeId}.vvproj`;
        break;
      case "check-run":
        opts["--run-dir"] = base;
        break;
      case "prepare-run":
        opts["--source-run-dir"] = base;
        break;
    }
    onApply(opts);
  };

  const needsEpisode = !["check-run", "prepare-run", "dict-sync"].includes(command);

  return (
    <div className="flex flex-wrap gap-2 items-end">
      {/* Run select */}
      <div className="flex-1 min-w-48 space-y-1.5">
        <Label>Run</Label>
        <select
          value={runKey}
          onChange={(e) => setRunKey(e.target.value)}
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
      {needsEpisode && (
        <div className="w-24 space-y-1.5">
          <Label>Episode</Label>
          <Input
            value={episodeId}
            onChange={(e) => setEpisodeId(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={handleApply}
        disabled={disabled || !runKey}
      >
        パスを適用
      </Button>
    </div>
  );
}
