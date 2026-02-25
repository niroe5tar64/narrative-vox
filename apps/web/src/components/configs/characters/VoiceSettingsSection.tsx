import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Speaker, SpeakerInfo } from "@/api/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Fieldset } from "@/components/ui/fieldset";
import { Label } from "@/components/ui/label";
import { VoicePreviewButton } from "@/components/ui/VoicePreviewButton";
import { cn } from "@/lib/utils";

import type { CharForm, EmotionRow } from "./characterForm";

function SpeakerPicker({
  speakers,
  speakerInfoMap,
  value,
  onSelect,
}: {
  speakers: Speaker[];
  speakerInfoMap: Record<string, SpeakerInfo>;
  value: string;
  onSelect: (speakerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const selected = speakers.find((s) => s.speaker_uuid === value);
  const selectedIcon = value
    ? speakerInfoMap[value]?.style_infos[0]?.icon
    : undefined;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        onClick={() => setOpen((v) => !v)}
      >
        {selectedIcon ? (
          <img
            src={`data:image/png;base64,${selectedIcon}`}
            alt=""
            className="h-7 w-7 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <span className="h-7 w-7 flex-shrink-0 rounded bg-slate-100" />
        )}
        <span className="flex-1 text-left">
          {selected?.name ?? "スピーカーを選択..."}
        </span>
        <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {speakers.map((s) => {
            const icon = speakerInfoMap[s.speaker_uuid]?.style_infos[0]?.icon;
            return (
              <button
                key={s.speaker_uuid}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50",
                  s.speaker_uuid === value &&
                    "bg-emerald-50 font-medium text-emerald-700",
                )}
                onClick={() => {
                  onSelect(s.speaker_uuid);
                  setOpen(false);
                }}
              >
                {icon ? (
                  <img
                    src={`data:image/png;base64,${icon}`}
                    alt=""
                    className="h-7 w-7 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-7 w-7 flex-shrink-0 rounded bg-slate-100" />
                )}
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StyleSelect({
  speakers,
  speakerId,
  value,
  onChange,
  disabled,
}: {
  speakers: Speaker[];
  speakerId: string;
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
}) {
  const speaker = speakers.find((s) => s.speaker_uuid === speakerId);
  if (!speaker) {
    return <span className="text-xs text-slate-400">スピーカー未選択</span>;
  }
  return (
    <select
      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60 disabled:bg-slate-50 disabled:text-slate-400"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {speaker.styles.map((st) => (
        <option key={st.id} value={String(st.id)}>
          {st.name} ({st.id})
        </option>
      ))}
    </select>
  );
}

type Props = {
  form: CharForm;
  speakers: Speaker[];
  speakerInfoMap: Record<string, SpeakerInfo>;
  isVvRunning: boolean;
  onPatch: (patch: Partial<CharForm>) => void;
  onUpdateEmotionRow: (index: number, patch: Partial<EmotionRow>) => void;
};

export function VoiceSettingsSection({
  form,
  speakers,
  speakerInfoMap,
  isVvRunning,
  onPatch,
  onUpdateEmotionRow,
}: Props) {
  return (
    <Fieldset legend="Voice">
      {isVvRunning && speakers.length > 0 ? (
        <div>
          <Label>Speaker</Label>
          <SpeakerPicker
            speakers={speakers}
            speakerInfoMap={speakerInfoMap}
            value={form.voiceSpeakerId}
            onSelect={(speakerId) => {
              const spk = speakers.find((s) => s.speaker_uuid === speakerId);
              const firstStyleId = spk?.styles[0]?.id;
              onPatch({
                voiceSpeakerId: speakerId,
                ...(firstStyleId !== undefined && {
                  voiceStyleId: String(firstStyleId),
                  emotionRows: form.emotionRows.map((r) => ({
                    ...r,
                    styleId: String(firstStyleId),
                  })),
                }),
              });
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-amber-600">
          VOICEVOX未起動のためスピーカー変更不可
          {form.voiceSpeakerId && (
            <span className="ml-2 font-mono text-slate-500">
              {form.voiceSpeakerId}
            </span>
          )}
        </p>
      )}

      <div className="mt-3">
        <div>
          <label
            htmlFor=""
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Emotion Styles
          </label>
        </div>
        <Fieldset legend="">
          <div className="space-y-1">
            <div className="flex h-8 items-center gap-3">
              <Checkbox checked disabled className="cursor-not-allowed" />
              <span className="w-24 font-mono text-sm">default</span>
              <span className="w-20 text-xs text-slate-400">デフォルト</span>
              <StyleSelect
                speakers={speakers}
                speakerId={form.voiceSpeakerId}
                value={form.voiceStyleId}
                onChange={(v) => onPatch({ voiceStyleId: v })}
                disabled={!isVvRunning}
              />
              <VoicePreviewButton
                voiceSample={
                  speakerInfoMap[form.voiceSpeakerId]?.style_infos.find(
                    (si) => si.id === Number(form.voiceStyleId),
                  )?.voice_samples[0]
                }
              />
            </div>

            {form.emotionRows.map((row, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed preset order
                key={i}
                className="flex h-8 items-center gap-3"
              >
                <Checkbox
                  id={`emotion-${row.key}`}
                  checked={row.enabled}
                  onCheckedChange={(checked) =>
                    onUpdateEmotionRow(i, { enabled: checked === true })
                  }
                />
                <Label
                  htmlFor={`emotion-${row.key}`}
                  className="flex cursor-pointer items-center gap-3"
                >
                  <span className="w-24 font-mono">{row.key}</span>
                  <span className="w-20 text-xs text-slate-400">
                    {row.label}
                  </span>
                </Label>
                {row.enabled && (
                  <StyleSelect
                    speakers={speakers}
                    speakerId={form.voiceSpeakerId}
                    value={row.styleId}
                    onChange={(v) => onUpdateEmotionRow(i, { styleId: v })}
                    disabled={!isVvRunning}
                  />
                )}
                {row.enabled && (
                  <VoicePreviewButton
                    voiceSample={
                      speakerInfoMap[form.voiceSpeakerId]?.style_infos.find(
                        (si) => si.id === Number(row.styleId),
                      )?.voice_samples[0]
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </Fieldset>
      </div>
    </Fieldset>
  );
}
