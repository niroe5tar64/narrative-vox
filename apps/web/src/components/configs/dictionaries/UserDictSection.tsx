import { useQuery } from "@tanstack/react-query";
import { Play, Plus, Square, Trash2 } from "lucide-react";
import { useState } from "react";

import { api, type UserDict, type UserDictWord } from "@/api/client";
import { SaveStatus } from "@/components/feedback/SaveStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { useConfigEditor } from "@/hooks/useConfigEditor";
import { formatApiError } from "@/lib/format-api-error";
import { buildPitchDiagram } from "@/lib/pitch-diagram";
import { queryKeys } from "@/lib/query-keys";

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

export function UserDictSection({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const editor = useConfigEditor<UserDict>({
    queryKey: queryKeys.voicevox.config("user-dict"),
    queryFn: async () =>
      (await api.voicevox.getConfig("user-dict")) as UserDict,
    mutationFn: (data) => api.voicevox.putConfig("user-dict", data),
    onDirtyChange,
  });

  const { data: charsData } = useQuery({
    queryKey: queryKeys.characters.list(),
    queryFn: () => api.characters.list(),
  });
  const characters = charsData?.items ?? [];

  const [previewCharKey, setPreviewCharKey] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const previewChar =
    characters.find((c) => c.key === previewCharKey) ?? characters[0] ?? null;
  const { rowState, play } = useAudioPreview();

  const handlePreview = async (
    idx: number,
    pronunciation: string,
    accentType: number,
  ) => {
    if (!previewChar) return;
    try {
      setPreviewError(null);
      await play(
        idx,
        (async () => {
          const query = await api.voicevox.audioQuery(
            pronunciation,
            previewChar.voice.styleId,
          );
          const queryObj = query as { accent_phrases?: { accent: number }[] };
          if (queryObj.accent_phrases && queryObj.accent_phrases.length > 0) {
            queryObj.accent_phrases[0].accent = accentType;
            queryObj.accent_phrases = (await api.voicevox.moraPitch(
              queryObj.accent_phrases,
              previewChar.voice.styleId,
            )) as typeof queryObj.accent_phrases;
          }
          return api.voicevox.synthesis(previewChar.voice.styleId, query);
        })(),
      );
    } catch (e) {
      setPreviewError(`音声プレビュー失敗: ${formatApiError(e)}`);
    }
  };

  const addWord = () => {
    const newWord: UserDictWord = {
      surface: "",
      pronunciation: "",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    };
    editor.update((l) => ({ ...l, words: [...l.words, newWord] }));
  };

  const removeWord = (i: number) => {
    editor.update((l) => ({
      ...l,
      words: l.words.filter((_, idx) => idx !== i),
    }));
  };

  const updateWord = (i: number, patch: Partial<UserDictWord>) => {
    editor.update((l) => ({
      ...l,
      words: l.words.map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
    }));
  };

  if (editor.isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  const local = editor.data;
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredWords = local.words.filter((word) => {
    if (!normalizedSearch) return true;
    return [
      word.surface,
      word.pronunciation,
      String(word.accent_type),
      String(word.priority),
      word.word_type,
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });

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
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Surface / Pronunciation / 品詞で検索"
          className="h-7 text-xs"
        />
        <span className="ml-auto text-xs text-slate-400">
          {filteredWords.length}/{local.words.length}
        </span>
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
            {filteredWords.map((word) => {
              const i = local.words.indexOf(word);
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    <Input
                      value={word.surface}
                      onChange={(e) =>
                        updateWord(i, { surface: e.target.value })
                      }
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
                      const state = rowState[i] ?? null;
                      const disabled =
                        !word.pronunciation ||
                        !previewChar ||
                        state === "loading";
                      return (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            handlePreview(
                              i,
                              word.pronunciation,
                              word.accent_type,
                            )
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
              );
            })}
            {filteredWords.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center text-slate-400"
                >
                  {local.words.length === 0 ? "単語なし" : "検索結果なし"}
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
        <SaveStatus
          onSave={editor.save}
          isSaving={editor.isSaving}
          error={editor.error ?? previewError}
          success={editor.success}
        />
      </div>
    </section>
  );
}
