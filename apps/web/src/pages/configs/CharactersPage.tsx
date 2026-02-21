import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";

import { ApiError, api, type CharacterConfig, type Speaker } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";
import { cn } from "@/lib/utils";

// ===== Form state types =====

type EmotionRow = { key: string; styleId: string };

type CharForm = {
  key: string;
  name: string;
  description: string;
  voiceEngineId: string;
  voiceSpeakerId: string;
  voiceStyleId: string;
  emotionRows: EmotionRow[];
};

const EMPTY_FORM: CharForm = {
  key: "",
  name: "",
  description: "",
  voiceEngineId: "",
  voiceSpeakerId: "",
  voiceStyleId: "",
  emotionRows: [],
};

function charToForm(c: CharacterConfig): CharForm {
  return {
    key: c.key,
    name: c.name,
    description: c.description ?? "",
    voiceEngineId: c.voice.engineId,
    voiceSpeakerId: c.voice.speakerId,
    voiceStyleId: String(c.voice.styleId),
    emotionRows: Object.entries(c.emotionStyles).map(([k, v]) => ({
      key: k,
      styleId: String(v),
    })),
  };
}

function formToChar(f: CharForm, profile?: Record<string, unknown>): CharacterConfig {
  return {
    key: f.key,
    name: f.name,
    ...(f.description && { description: f.description }),
    voice: {
      engineId: f.voiceEngineId,
      speakerId: f.voiceSpeakerId,
      styleId: Number(f.voiceStyleId),
    },
    emotionStyles: Object.fromEntries(
      f.emotionRows.filter((r) => r.key.trim()).map((r) => [r.key, Number(r.styleId)]),
    ),
    ...(profile && { profile }),
  };
}

// ===== Speaker browser subcomponent =====

function SpeakerPicker({
  speakers,
  onSelect,
}: {
  speakers: Speaker[];
  onSelect: (speakerId: string, styleId: number) => void;
}) {
  const [selectedUuid, setSelectedUuid] = useState("");
  const speaker = speakers.find((s) => s.speaker_uuid === selectedUuid);

  return (
    <div className="flex flex-wrap gap-2">
      <select
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        value={selectedUuid}
        onChange={(e) => setSelectedUuid(e.target.value)}
      >
        <option value="">スピーカーを選択...</option>
        {speakers.map((s) => (
          <option key={s.speaker_uuid} value={s.speaker_uuid}>
            {s.name}
          </option>
        ))}
      </select>
      {speaker && (
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          defaultValue=""
          onChange={(e) => {
            const styleId = Number(e.target.value);
            if (styleId) onSelect(speaker.speaker_uuid, styleId);
          }}
        >
          <option value="">スタイルを選択...</option>
          {speaker.styles.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name} (id: {st.id})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ===== Main page =====

export function CharactersPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<CharForm>(EMPTY_FORM);
  const [savedFormStr, setSavedFormStr] = useState<string | null>(null);
  const [originalProfile, setOriginalProfile] = useState<Record<string, unknown> | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty = isNew
    ? JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)
    : savedFormStr !== null && JSON.stringify(form) !== savedFormStr;

  useDirtyGuard(isDirty);

  const { data: chars, isLoading } = useQuery({
    queryKey: ["characters"],
    queryFn: () => api.characters.list(),
  });

  const voicevoxStatusQuery = useQuery({
    queryKey: ["voicevox-status"],
    queryFn: () => api.voicevox.status(),
    retry: false,
  });
  const isVvRunning = voicevoxStatusQuery.data?.status === "running";

  const { data: speakers } = useQuery({
    queryKey: ["voicevox-speakers"],
    queryFn: () => api.voicevox.speakers(),
    enabled: isVvRunning,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (f: CharForm) => {
      const data = formToChar(f, originalProfile);
      return isNew ? api.characters.create(data) : api.characters.update(f.key, data);
    },
    onSuccess: (_, f) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      setError(null);
      setSuccess(true);
      setSavedFormStr(JSON.stringify(f));
      if (isNew) {
        setIsNew(false);
        setSelected(f.key);
      }
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : String(e));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.characters.delete(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      setSelected(null);
      setIsNew(false);
      setForm(EMPTY_FORM);
      setSavedFormStr(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.title : String(e));
    },
  });

  function selectChar(c: CharacterConfig) {
    if (isDirty && !window.confirm("未保存の変更があります。変更を破棄しますか？")) return;
    const f = charToForm(c);
    setSelected(c.key);
    setIsNew(false);
    setForm(f);
    setSavedFormStr(JSON.stringify(f));
    setOriginalProfile(c.profile);
    setError(null);
    setSuccess(false);
  }

  function startNew() {
    if (isDirty && !window.confirm("未保存の変更があります。変更を破棄しますか？")) return;
    setSelected(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setSavedFormStr(null);
    setOriginalProfile(undefined);
    setError(null);
    setSuccess(false);
  }

  function patch(p: Partial<CharForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function addEmotionRow() {
    patch({ emotionRows: [...form.emotionRows, { key: "", styleId: "0" }] });
  }

  function removeEmotionRow(i: number) {
    patch({ emotionRows: form.emotionRows.filter((_, idx) => idx !== i) });
  }

  function updateEmotionRow(i: number, p: Partial<EmotionRow>) {
    patch({
      emotionRows: form.emotionRows.map((r, idx) => (idx === i ? { ...r, ...p } : r)),
    });
  }

  const showEditor = isNew || selected !== null;

  return (
    <div className="flex min-h-0 gap-6">
      {/* List */}
      <div className="flex w-60 flex-shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Characters</h2>
          <Button size="sm" onClick={startNew}>
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
            {chars?.items.map((c) => {
              const item = c as CharacterConfig;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectChar(item)}
                  className={cn(
                    "rounded-md px-3 py-2 text-left text-sm transition-colors",
                    selected === item.key && !isNew
                      ? "bg-emerald-600 text-white"
                      : "hover:bg-slate-100",
                  )}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs opacity-60">{item.key}</div>
                </button>
              );
            })}
            {chars?.items.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">No characters</p>
            )}
          </div>
        )}
      </div>

      {/* Editor */}
      {showEditor ? (
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
          <h3 className="mb-5 text-base font-semibold">
            {isNew ? "New Character" : `Edit: ${selected}`}
          </h3>
          <div className="max-w-lg space-y-4">
            {/* Key */}
            <div>
              <Label htmlFor="char-key">Key</Label>
              <Input
                id="char-key"
                value={form.key}
                onChange={(e) => patch({ key: e.target.value })}
                readOnly={!isNew}
                className={!isNew ? "bg-slate-50 text-slate-500" : ""}
                placeholder="e.g. narrator"
              />
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="char-name">Name</Label>
              <Input
                id="char-name"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="表示名"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="char-desc">Description</Label>
              <Textarea
                id="char-desc"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="キャラクターの説明（任意）"
                rows={2}
              />
            </div>

            {/* Voice */}
            <fieldset className="rounded-md border border-slate-200 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Voice
              </legend>
              <div className="space-y-3">
                {isVvRunning && speakers && speakers.length > 0 && (
                  <div>
                    <Label>スピーカーブラウズ</Label>
                    <SpeakerPicker
                      speakers={speakers}
                      onSelect={(speakerId, styleId) =>
                        patch({ voiceSpeakerId: speakerId, voiceStyleId: String(styleId) })
                      }
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      選択すると speakerId / styleId が反映されます
                    </p>
                  </div>
                )}
                {voicevoxStatusQuery.isError && (
                  <p className="text-xs text-amber-600">VOICEVOX未起動のため手動入力</p>
                )}
                <div>
                  <Label htmlFor="char-engine-id">Engine ID</Label>
                  <Input
                    id="char-engine-id"
                    value={form.voiceEngineId}
                    onChange={(e) => patch({ voiceEngineId: e.target.value })}
                    placeholder="engine UUID"
                  />
                </div>
                <div>
                  <Label htmlFor="char-speaker-id">Speaker ID (UUID)</Label>
                  <Input
                    id="char-speaker-id"
                    value={form.voiceSpeakerId}
                    onChange={(e) => patch({ voiceSpeakerId: e.target.value })}
                    placeholder="speaker UUID"
                  />
                </div>
                <div>
                  <Label htmlFor="char-style-id">Style ID</Label>
                  <Input
                    id="char-style-id"
                    type="number"
                    value={form.voiceStyleId}
                    onChange={(e) => patch({ voiceStyleId: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            </fieldset>

            {/* Emotion styles */}
            <fieldset className="rounded-md border border-slate-200 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Emotion Styles
              </legend>
              <div className="space-y-2">
                {form.emotionRows.map((row, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static order
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => updateEmotionRow(i, { key: e.target.value })}
                      placeholder="emotion key (e.g. calm)"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={row.styleId}
                      onChange={(e) => updateEmotionRow(i, { styleId: e.target.value })}
                      placeholder="styleId"
                      className="w-24"
                    />
                    <button
                      type="button"
                      onClick={() => removeEmotionRow(i)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={addEmotionRow}>
                  <Plus className="h-4 w-4" />
                  Add emotion
                </Button>
              </div>
            </fieldset>

            {/* Feedback */}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">Saved successfully.</p>}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Spinner className="mr-1" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                Save
              </Button>
              {!isNew && selected && (
                <Button
                  variant="secondary"
                  className="text-red-600 hover:text-red-700"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`"${selected}" を削除しますか？`)) {
                      deleteMutation.mutate(selected);
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          キャラクターを選択するか、New で作成してください
        </div>
      )}
    </div>
  );
}
