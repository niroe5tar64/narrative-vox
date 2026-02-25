import { Plus } from "lucide-react";

import type { CharacterConfig, SpeakerInfo } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Props = {
  chars: CharacterConfig[];
  selected: string | null;
  isNew: boolean;
  isLoading: boolean;
  speakerInfoMap: Record<string, SpeakerInfo>;
  onSelect: (item: CharacterConfig) => void;
  onStartNew: () => void;
};

export function CharactersListPane({
  chars,
  selected,
  isNew,
  isLoading,
  speakerInfoMap,
  onSelect,
  onStartNew,
}: Props) {
  return (
    <div className="flex w-60 flex-shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Characters</h2>
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
          {chars.map((item) => {
            const info = speakerInfoMap[item.voice.speakerId];
            const icon =
              info?.style_infos.find((s) => s.id === item.voice.styleId)
                ?.icon ?? info?.style_infos[0]?.icon;
            const isSelected = selected === item.key && !isNew;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-slate-100",
                )}
              >
                {icon ? (
                  <img
                    src={`data:image/png;base64,${icon}`}
                    alt=""
                    className="h-9 w-9 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-9 w-9 flex-shrink-0 rounded bg-slate-200" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs opacity-60">{item.key}</div>
                </div>
              </button>
            );
          })}
          {chars.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">
              No characters
            </p>
          )}
        </div>
      )}
    </div>
  );
}
