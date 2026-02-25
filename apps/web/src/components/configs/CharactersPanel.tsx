import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  api,
  type CharacterConfig,
  type SpeakerInfo,
} from "@/api/client";
import { CharacterEditorPane } from "@/components/configs/characters/CharacterEditorPane";
import { CharactersListPane } from "@/components/configs/characters/CharactersListPane";
import {
  type CharForm,
  charToForm,
  EMPTY_FORM,
  type EmotionRow,
  formToChar,
} from "@/components/configs/characters/characterForm";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";

export function CharactersPanel({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
} = {}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<CharForm>(EMPTY_FORM);
  const [savedFormStr, setSavedFormStr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty = isNew
    ? JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)
    : savedFormStr !== null && JSON.stringify(form) !== savedFormStr;

  useDirtyGuard(isDirty);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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

  const speakerInfoQueries = useQueries({
    queries: (speakers ?? []).map((s) => ({
      queryKey: ["voicevox-speaker-info", s.speaker_uuid],
      queryFn: () => api.voicevox.speakerInfo(s.speaker_uuid),
      enabled: isVvRunning && !!speakers,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const speakerInfoMap = useMemo(() => {
    const map: Record<string, SpeakerInfo> = {};
    for (let i = 0; i < (speakers ?? []).length; i++) {
      const data = speakerInfoQueries[i]?.data;
      if (data) map[(speakers ?? [])[i].speaker_uuid] = data;
    }
    return map;
  }, [speakerInfoQueries, speakers]);

  const saveMutation = useMutation({
    mutationFn: (f: CharForm) => {
      const data = formToChar(f);
      return isNew
        ? api.characters.create(data)
        : api.characters.update(f.key, data);
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
      setError(
        e instanceof ApiError
          ? `${e.title}${e.detail ? `: ${e.detail}` : ""}`
          : String(e),
      );
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
    if (
      isDirty &&
      !window.confirm("未保存の変更があります。変更を破棄しますか？")
    )
      return;
    const f = charToForm(c);
    setSelected(c.key);
    setIsNew(false);
    setForm(f);
    setSavedFormStr(JSON.stringify(f));
    setError(null);
    setSuccess(false);
  }

  function startNew() {
    if (
      isDirty &&
      !window.confirm("未保存の変更があります。変更を破棄しますか？")
    )
      return;
    setSelected(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setSavedFormStr(null);
    setError(null);
    setSuccess(false);
  }

  function patch(patchForm: Partial<CharForm>) {
    setForm((f) => ({ ...f, ...patchForm }));
  }

  function updateEmotionRow(i: number, patchRow: Partial<EmotionRow>) {
    patch({
      emotionRows: form.emotionRows.map((r, idx) =>
        idx === i ? { ...r, ...patchRow } : r,
      ),
    });
  }

  const showEditor = isNew || selected !== null;
  const charsItems = (chars?.items ?? []) as CharacterConfig[];

  return (
    <div className="flex min-h-0 gap-6">
      <CharactersListPane
        chars={charsItems}
        selected={selected}
        isNew={isNew}
        isLoading={isLoading}
        speakerInfoMap={speakerInfoMap}
        onSelect={selectChar}
        onStartNew={startNew}
      />

      {showEditor ? (
        <CharacterEditorPane
          selected={selected}
          isNew={isNew}
          form={form}
          speakers={speakers ?? []}
          speakerInfoMap={speakerInfoMap}
          isVvRunning={isVvRunning}
          error={error}
          success={success}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          onPatch={patch}
          onUpdateEmotionRow={updateEmotionRow}
          onSave={() => {
            try {
              JSON.parse(form.profileJson);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Invalid JSON";
              setError(`Profile JSON エラー: ${msg}`);
              return;
            }
            saveMutation.mutate(form);
          }}
          onDelete={() => {
            if (selected && window.confirm(`"${selected}" を削除しますか？`)) {
              deleteMutation.mutate(selected);
            }
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          キャラクターを選択するか、New で作成してください
        </div>
      )}
    </div>
  );
}
