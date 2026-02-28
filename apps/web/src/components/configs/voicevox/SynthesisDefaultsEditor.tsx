import { api } from "@/api/client";
import { SaveStatus } from "@/components/feedback/SaveStatus";
import { Fieldset } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useConfigEditor } from "@/hooks/useConfigEditor";
import { queryKeys } from "@/lib/query-keys";

import { NumberField } from "./NumberField";

type QueryDefaults = {
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number | string;
  outputStereo: boolean;
};

type SynthesisDefaults = {
  appVersion: string;
  tpqn: number;
  tempoBpm: number;
  timeSignature: { beats: number; beatType: number };
  queryDefaults: QueryDefaults;
};

export function SynthesisDefaultsEditor({
  configName,
  onDirtyChange,
}: {
  configName: "synthesis-defaults";
  onDirtyChange: (dirty: boolean) => void;
}) {
  const editor = useConfigEditor<SynthesisDefaults>({
    queryKey: queryKeys.voicevox.config(configName),
    queryFn: async () =>
      (await api.voicevox.getConfig(configName)) as SynthesisDefaults,
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

  function patchQD(patch: Partial<QueryDefaults>) {
    editor.update((l) => ({
      ...l,
      queryDefaults: { ...l.queryDefaults, ...patch },
    }));
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>appVersion</Label>
          <Input
            value={local.appVersion}
            onChange={(e) =>
              editor.update((l) => ({ ...l, appVersion: e.target.value }))
            }
          />
        </div>
        <NumberField
          label="tpqn"
          value={local.tpqn}
          step={1}
          onChange={(v) => editor.update((l) => ({ ...l, tpqn: v }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="tempoBpm"
          value={local.tempoBpm}
          step={1}
          onChange={(v) => editor.update((l) => ({ ...l, tempoBpm: v }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="beats"
            value={local.timeSignature.beats}
            step={1}
            onChange={(v) =>
              editor.update((l) => ({
                ...l,
                timeSignature: { ...l.timeSignature, beats: v },
              }))
            }
          />
          <NumberField
            label="beatType"
            value={local.timeSignature.beatType}
            step={1}
            onChange={(v) =>
              editor.update((l) => ({
                ...l,
                timeSignature: { ...l.timeSignature, beatType: v },
              }))
            }
          />
        </div>
      </div>

      <Fieldset legend="Query Defaults">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="speedScale"
            value={local.queryDefaults.speedScale}
            onChange={(v) => patchQD({ speedScale: v })}
          />
          <NumberField
            label="pitchScale"
            value={local.queryDefaults.pitchScale}
            onChange={(v) => patchQD({ pitchScale: v })}
          />
          <NumberField
            label="intonationScale"
            value={local.queryDefaults.intonationScale}
            onChange={(v) => patchQD({ intonationScale: v })}
          />
          <NumberField
            label="volumeScale"
            value={local.queryDefaults.volumeScale}
            onChange={(v) => patchQD({ volumeScale: v })}
          />
          <NumberField
            label="pauseLengthScale"
            value={local.queryDefaults.pauseLengthScale}
            onChange={(v) => patchQD({ pauseLengthScale: v })}
          />
          <NumberField
            label="prePhonemeLength"
            value={local.queryDefaults.prePhonemeLength}
            onChange={(v) => patchQD({ prePhonemeLength: v })}
          />
          <NumberField
            label="postPhonemeLength"
            value={local.queryDefaults.postPhonemeLength}
            onChange={(v) => patchQD({ postPhonemeLength: v })}
          />
          <div>
            <Label>outputSamplingRate</Label>
            <Input
              value={String(local.queryDefaults.outputSamplingRate)}
              onChange={(e) => {
                const v = e.target.value;
                patchQD({
                  outputSamplingRate:
                    v === "engineDefault" ? "engineDefault" : Number(v),
                });
              }}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="outputStereo"
              checked={local.queryDefaults.outputStereo}
              onChange={(e) => patchQD({ outputStereo: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <label htmlFor="outputStereo" className="text-sm text-slate-700">
              outputStereo
            </label>
          </div>
        </div>
      </Fieldset>

      <SaveStatus
        onSave={editor.save}
        isSaving={editor.isSaving}
        error={editor.error}
        success={editor.success}
      />
    </div>
  );
}
