import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";

import { ApiError, api, type ReadingDictionary, type UserDict, type UserDictWord } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const WORD_TYPES = ["PROPER_NOUN", "COMMON_NOUN", "VERB", "ADJECTIVE", "SUFFIX"] as const;

// ===== Reading Dictionary =====

function ReadingDictionarySection() {
  const qc = useQueryClient();
  const [local, setLocal] = useState<ReadingDictionary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["voicevox-config", "reading-dictionary"],
    queryFn: () => api.voicevox.getConfig("reading-dictionary"),
  });

  useEffect(() => {
    if (data) setLocal(data as ReadingDictionary);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.voicevox.putConfig("reading-dictionary", local),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voicevox-config", "reading-dictionary"] });
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : String(e));
    },
  });

  function addEntry() {
    setLocal((l) => l && { ...l, entries: [...l.entries, { surface: "", reading: "" }] });
  }

  function removeEntry(i: number) {
    setLocal((l) => l && { ...l, entries: l.entries.filter((_, idx) => idx !== i) });
  }

  function updateEntry(i: number, patch: { surface?: string; reading?: string }) {
    setLocal(
      (l) =>
        l && {
          ...l,
          entries: l.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
        },
    );
  }

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>;
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Reading Dictionary</h3>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Surface</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Reading</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {local.entries.map((entry, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable order
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1">
                  <Input
                    value={entry.surface}
                    onChange={(e) => updateEntry(i, { surface: e.target.value })}
                    placeholder="表記"
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    value={entry.reading}
                    onChange={(e) => updateEntry(i, { reading: e.target.value })}
                    placeholder="読み"
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeEntry(i)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {local.entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                  エントリなし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Spinner className="mr-1" /> : <Save className="mr-1 h-4 w-4" />}
          Save
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Saved.</p>}
      </div>
    </section>
  );
}

// ===== User Dictionary =====

function UserDictSection() {
  const qc = useQueryClient();
  const [local, setLocal] = useState<UserDict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["voicevox-config", "user-dict"],
    queryFn: () => api.voicevox.getConfig("user-dict"),
  });

  useEffect(() => {
    if (data) setLocal(data as UserDict);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.voicevox.putConfig("user-dict", local),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voicevox-config", "user-dict"] });
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : String(e));
    },
  });

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
    setLocal((l) => l && { ...l, words: l.words.filter((_, idx) => idx !== i) });
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

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>;
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">User Dictionary</h3>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Surface</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Pronunciation</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Accent</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Word Type</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Priority</th>
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
                    onChange={(e) => updateWord(i, { pronunciation: e.target.value })}
                    placeholder="読み（カナ）"
                    className="w-32 border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    value={word.accent_type}
                    onChange={(e) => updateWord(i, { accent_type: Number(e.target.value) })}
                    className="w-16 border-0 shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    value={word.word_type}
                    onChange={(e) => updateWord(i, { word_type: e.target.value })}
                  >
                    {WORD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
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
                    onChange={(e) => updateWord(i, { priority: Number(e.target.value) })}
                    className="w-16 border-0 shadow-none focus-visible:ring-0"
                  />
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
                <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
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
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Spinner className="mr-1" /> : <Save className="mr-1 h-4 w-4" />}
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
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">Dictionaries</h2>
      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur space-y-8">
        <ReadingDictionarySection />
        <hr className="border-slate-200" />
        <UserDictSection />
      </div>
    </div>
  );
}
