import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Save, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api, type UserDict, type UserDictWord } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";

const WORD_TYPES = [
  "PROPER_NOUN",
  "COMMON_NOUN",
  "VERB",
  "ADJECTIVE",
  "SUFFIX",
] as const;

const WORD_TYPE_LABELS: Record<string, string> = {
  PROPER_NOUN: "固有名詞",
  COMMON_NOUN: "普通名詞",
  VERB: "動詞",
  ADJECTIVE: "形容詞",
  SUFFIX: "接尾辞",
};

function splitMora(pronunciation: string): string[] {
  const COMBINING = new Set("ァィゥェォャュョヮ");
  const morae: string[] = [];
  for (const ch of pronunciation) {
    if (COMBINING.has(ch) && morae.length > 0) {
      morae[morae.length - 1] += ch;
    } else {
      morae.push(ch);
    }
  }
  return morae;
}

function getPitchPattern(morae: string[], accentType: number): ("H" | "L")[] {
  return morae.map((_, i) => {
    if (accentType === 0) return i === 0 ? "L" : "H"; // 平板型
    if (accentType === 1) return i === 0 ? "H" : "L"; // 頭高型
    if (i === 0) return "L";
    return i < accentType ? "H" : "L"; // 中高型 / 尾高型
  });
}

function buildPitchDiagram(pronunciation: string, accentType: number): string {
  if (!pronunciation) return "";
  const morae = splitMora(pronunciation);
  if (morae.length === 0) return "";
  const pattern = getPitchPattern(morae, accentType);
  let result = "";
  for (let i = 0; i < morae.length; i++) {
    result += morae[i];
    if (i < morae.length - 1) {
      if (pattern[i] === "L" && pattern[i + 1] === "H") result += "↑";
      else if (pattern[i] === "H" && pattern[i + 1] === "L") result += "↓";
    }
  }
  return result;
}

// ===== User Dictionary =====

function UserDictSection({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<UserDict | null>(null);
  const [savedStr, setSavedStr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["voicevox-config", "user-dict"],
    queryFn: () => api.voicevox.getConfig("user-dict"),
  });

  const { data: charsData } = useQuery({
    queryKey: ["characters"],
    queryFn: () => api.characters.list(),
  });
  const characters = charsData?.items ?? [];

  const [previewCharKey, setPreviewCharKey] = useState<string>("");
  const previewChar =
    characters.find((c) => c.key === previewCharKey) ?? characters[0] ?? null;

  const [rowPreviewState, setRowPreviewState] = useState<
    Record<number, "loading" | "playing" | null>
  >({});

  const playingAudioRef = useRef<{
    audio: HTMLAudioElement;
    idx: number;
    blobUrl: string;
  } | null>(null);

  useEffect(() => {
    if (data) {
      setLocal(data as UserDict);
      setSavedStr(JSON.stringify(data));
    }
  }, [data]);

  useEffect(() => {
    if (savedStr === null || local === null) return;
    onDirtyChange(JSON.stringify(local) !== savedStr);
  }, [local, savedStr, onDirtyChange]); // onDirtyChange は安定した参照を親から受け取る

  const saveMutation = useMutation({
    mutationFn: () => api.voicevox.putConfig("user-dict", local),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voicevox-config", "user-dict"] });
      setError(null);
      setSuccess(true);
      setSavedStr(JSON.stringify(local));
      onDirtyChange(false);
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

  const handlePreview = useCallback(
    async (idx: number, pronunciation: string, accentType: number) => {
      if (playingAudioRef.current?.idx === idx) {
        playingAudioRef.current.audio.pause();
        URL.revokeObjectURL(playingAudioRef.current.blobUrl);
        playingAudioRef.current = null;
        setRowPreviewState((s) => ({ ...s, [idx]: null }));
        return;
      }
      if (playingAudioRef.current) {
        playingAudioRef.current.audio.pause();
        URL.revokeObjectURL(playingAudioRef.current.blobUrl);
        const prev = playingAudioRef.current.idx;
        playingAudioRef.current = null;
        setRowPreviewState((s) => ({ ...s, [prev]: null }));
      }
      if (!previewChar) return;
      setRowPreviewState((s) => ({ ...s, [idx]: "loading" }));
      try {
        const query = await api.voicevox.audioQuery(
          pronunciation,
          previewChar.voice.styleId,
        );
        const queryObj = query as { accent_phrases?: { accent: number }[] };
        if (queryObj.accent_phrases && queryObj.accent_phrases.length > 0) {
          queryObj.accent_phrases[0].accent = accentType;
          // accent 変更後に mora_pitch でピッチ値を再計算する（synthesis はピッチ値を直接使用）
          queryObj.accent_phrases = (await api.voicevox.moraPitch(
            queryObj.accent_phrases,
            previewChar.voice.styleId,
          )) as typeof queryObj.accent_phrases;
        }
        const blobUrl = await api.voicevox.synthesis(
          previewChar.voice.styleId,
          query,
        );
        const audio = new Audio(blobUrl);
        playingAudioRef.current = { audio, idx, blobUrl };
        setRowPreviewState((s) => ({ ...s, [idx]: "playing" }));
        audio.play();
        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(blobUrl);
          if (playingAudioRef.current?.idx === idx)
            playingAudioRef.current = null;
          setRowPreviewState((s) => ({ ...s, [idx]: null }));
        });
      } catch (e) {
        setRowPreviewState((s) => ({ ...s, [idx]: null }));
        setError(
          e instanceof ApiError
            ? `音声プレビュー失敗: ${e.title}`
            : `音声プレビュー失敗: ${String(e)}`,
        );
      }
    },
    [previewChar],
  );

  useEffect(() => {
    return () => {
      if (playingAudioRef.current) {
        playingAudioRef.current.audio.pause();
        URL.revokeObjectURL(playingAudioRef.current.blobUrl);
      }
    };
  }, []);

  function addWord() {
    const newWord: UserDictWord = {
      surface: "",
      pronunciation: "",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    };
    setLocal((l) => l && { ...l, words: [...l.words, newWord] });
  }

  function removeWord(i: number) {
    setLocal(
      (l) => l && { ...l, words: l.words.filter((_, idx) => idx !== i) },
    );
  }

  function updateWord(i: number, patch: Partial<UserDictWord>) {
    setLocal(
      (l) =>
        l && {
          ...l,
          words: l.words.map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
        },
    );
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">User Dictionary</h3>
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
          音声プレビュー：
        </span>
        {characters.length === 0 ? (
          <span className="text-xs text-slate-400">キャラクター未設定</span>
        ) : (
          <select
            className="h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            value={previewCharKey || (characters[0]?.key ?? "")}
            onChange={(e) => setPreviewCharKey(e.target.value)}
          >
            {characters.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Surface
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Pronunciation
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                アクセント
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                品詞
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Priority
              </th>
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {local.words.map((word, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable order
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1">
                  <Input
                    value={word.surface}
                    onChange={(e) => updateWord(i, { surface: e.target.value })}
                    placeholder="表記"
                    className="w-28 border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    value={word.pronunciation}
                    onChange={(e) =>
                      updateWord(i, { pronunciation: e.target.value })
                    }
                    placeholder="読み（カナ）"
                    className="w-32 border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1">
                  <div className="flex flex-col gap-0.5">
                    <Input
                      type="number"
                      min={0}
                      value={word.accent_type}
                      onChange={(e) =>
                        updateWord(i, { accent_type: Number(e.target.value) })
                      }
                      className="w-16 border-0 shadow-none focus-visible:ring-0"
                    />
                    {word.pronunciation && (
                      <span className="px-1 font-mono text-xs leading-tight text-slate-500">
                        {buildPitchDiagram(
                          word.pronunciation,
                          word.accent_type,
                        )}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1">
                  <select
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    value={word.word_type}
                    onChange={(e) =>
                      updateWord(i, { word_type: e.target.value })
                    }
                  >
                    {WORD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {WORD_TYPE_LABELS[t] ?? t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    value={word.priority}
                    min={0}
                    max={10}
                    onChange={(e) =>
                      updateWord(i, { priority: Number(e.target.value) })
                    }
                    className="w-16 border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  {(() => {
                    const state = rowPreviewState[i] ?? null;
                    const disabled =
                      !word.pronunciation ||
                      !previewChar ||
                      state === "loading";
                    return (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          handlePreview(i, word.pronunciation, word.accent_type)
                        }
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          state === "playing"
                            ? "停止"
                            : state === "loading"
                              ? "生成中..."
                              : "プレビュー再生"
                        }
                      >
                        {state === "loading" ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : state === "playing" ? (
                          <Square className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    );
                  })()}
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeWord(i)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {local.words.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center text-slate-400"
                >
                  単語なし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={addWord}>
          <Plus className="h-4 w-4" />
          Add word
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Spinner className="mr-1" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Save
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Saved.</p>}
      </div>
    </section>
  );
}

// ===== Main page =====

export function DictionariesPage() {
  const [userDirty, setUserDirty] = useState(false);
  useDirtyGuard(userDirty);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">Dictionaries</h2>
      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur space-y-8">
        <UserDictSection onDirtyChange={setUserDirty} />
      </div>
    </div>
  );
}
