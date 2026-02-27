import { api } from "@/api/client";
import { SaveStatus } from "@/components/feedback/SaveStatus";
import { Fieldset } from "@/components/ui/fieldset";
import { Spinner } from "@/components/ui/spinner";
import { useConfigEditor } from "@/hooks/useConfigEditor";
import { queryKeys } from "@/lib/query-keys";

import { NumberField } from "./NumberField";

type SpeedPreset = {
  speedScale: number;
  pauseLengthScale: number;
  postPhonemeLength: number;
};
type SpeedProfiles = { version: number; presets: Record<string, SpeedPreset> };

export function SpeedProfilesEditor({
  configName,
  onDirtyChange,
}: {
  configName: "speed-profiles";
  onDirtyChange: (dirty: boolean) => void;
}) {
  const editor = useConfigEditor<SpeedProfiles>({
    queryKey: queryKeys.voicevox.config(configName),
    queryFn: async () =>
      (await api.voicevox.getConfig(configName)) as SpeedProfiles,
    mutationFn: (data) => api.voicevox.putConfig(configName, data),
    onDirtyChange,
  });

  if (editor.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  const local = editor.data;
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  function patchPreset(name: string, patch: Partial<SpeedPreset>) {
    editor.update((l) => ({
      ...l,
      presets: { ...l.presets, [name]: { ...l.presets[name], ...patch } },
    }));
  }

  return (
    <div className="max-w-lg space-y-4">
      {Object.entries(local.presets).map(([name, preset]) => (
        <Fieldset
          key={name}
          legend={name}
          legendClassName="px-1 text-sm font-semibold capitalize text-slate-700"
        >
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="speedScale" value={preset.speedScale} onChange={(v) => patchPreset(name, { speedScale: v })} />
            <NumberField label="pauseLengthScale" value={preset.pauseLengthScale} onChange={(v) => patchPreset(name, { pauseLengthScale: v })} />
            <NumberField label="postPhonemeLength" value={preset.postPhonemeLength} onChange={(v) => patchPreset(name, { postPhonemeLength: v })} />
          </div>
        </Fieldset>
      ))}

      <SaveStatus
        onSave={editor.save}
        isSaving={editor.isSaving}
        error={editor.error}
        success={editor.success}
      />
    </div>
  );
}
