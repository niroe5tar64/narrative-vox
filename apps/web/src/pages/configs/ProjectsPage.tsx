import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";

import { ApiError, api, type CharacterConfig, type GenreConfig, type ProjectConfig } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";
import { cn } from "@/lib/utils";

// ===== Form state =====

type CastRow = { role: string; charKey: string };

type ProjForm = {
  PROJECT_ID: string;
  PROJECT_TITLE: string;
  GENRE_ID: string;
  STYLE_ID: string;
  EPISODE_ID: string;
  SOURCE_MARKDOWN_PATHS: string;
  AUDIENCE_BACKGROUND: string;
  AUDIENCE_LEVEL: string;
  AUDIENCE_INTEREST: string;
  BASELINE_CONTEXT_OR_EMPTY: string;
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: string;
  PROJECT_BLUEPRINT_JSON_PATH: string;
  REPO_ROOT_PATH: string;
  DEEP_DIVE_FOCUS: string;
  castRows: CastRow[];
  NOTES: string;
};

const EMPTY_FORM: ProjForm = {
  PROJECT_ID: "",
  PROJECT_TITLE: "",
  GENRE_ID: "",
  STYLE_ID: "",
  EPISODE_ID: "E01",
  SOURCE_MARKDOWN_PATHS: "",
  AUDIENCE_BACKGROUND: "",
  AUDIENCE_LEVEL: "",
  AUDIENCE_INTEREST: "",
  BASELINE_CONTEXT_OR_EMPTY: "",
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
  PROJECT_BLUEPRINT_JSON_PATH: "",
  REPO_ROOT_PATH: "",
  DEEP_DIVE_FOCUS: "",
  castRows: [],
  NOTES: "",
};

function projToForm(p: ProjectConfig): ProjForm {
  return {
    PROJECT_ID: p.PROJECT_ID,
    PROJECT_TITLE: p.PROJECT_TITLE,
    GENRE_ID: p.GENRE_ID,
    STYLE_ID: p.STYLE_ID,
    EPISODE_ID: p.EPISODE_ID,
    SOURCE_MARKDOWN_PATHS: p.SOURCE_MARKDOWN_PATHS,
    AUDIENCE_BACKGROUND: p.AUDIENCE_BACKGROUND,
    AUDIENCE_LEVEL: p.AUDIENCE_LEVEL,
    AUDIENCE_INTEREST: p.AUDIENCE_INTEREST,
    BASELINE_CONTEXT_OR_EMPTY: p.BASELINE_CONTEXT_OR_EMPTY,
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: p.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY,
    PROJECT_BLUEPRINT_JSON_PATH: p.PROJECT_BLUEPRINT_JSON_PATH,
    REPO_ROOT_PATH: (p as unknown as Record<string, string>).REPO_ROOT_PATH ?? "",
    DEEP_DIVE_FOCUS: (p as unknown as Record<string, string>).DEEP_DIVE_FOCUS ?? "",
    castRows: Object.entries(p.CAST).map(([role, charKey]) => ({ role, charKey })),
    NOTES: p.NOTES ?? "",
  };
}

function formToProj(f: ProjForm, extraFields: string[]): ProjectConfig {
  const base: ProjectConfig = {
    PROJECT_ID: f.PROJECT_ID,
    PROJECT_TITLE: f.PROJECT_TITLE,
    GENRE_ID: f.GENRE_ID,
    STYLE_ID: f.STYLE_ID,
    EPISODE_ID: f.EPISODE_ID,
    SOURCE_MARKDOWN_PATHS: f.SOURCE_MARKDOWN_PATHS,
    AUDIENCE_BACKGROUND: f.AUDIENCE_BACKGROUND,
    AUDIENCE_LEVEL: f.AUDIENCE_LEVEL,
    AUDIENCE_INTEREST: f.AUDIENCE_INTEREST,
    BASELINE_CONTEXT_OR_EMPTY: f.BASELINE_CONTEXT_OR_EMPTY,
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: f.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY,
    PROJECT_BLUEPRINT_JSON_PATH: f.PROJECT_BLUEPRINT_JSON_PATH,
    CAST: Object.fromEntries(
      f.castRows.filter((r) => r.role.trim()).map((r) => [r.role, r.charKey]),
    ),
    ...(f.NOTES && { NOTES: f.NOTES }),
  };
  const extra = base as unknown as Record<string, string>;
  if (extraFields.includes("REPO_ROOT_PATH") && f.REPO_ROOT_PATH) {
    extra.REPO_ROOT_PATH = f.REPO_ROOT_PATH;
  }
  if (extraFields.includes("DEEP_DIVE_FOCUS") && f.DEEP_DIVE_FOCUS) {
    extra.DEEP_DIVE_FOCUS = f.DEEP_DIVE_FOCUS;
  }
  return base;
}

// ===== Field row helper =====

const selectClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60";

function Required() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

function Optional() {
  return <span className="ml-1 text-xs text-slate-400">(任意)</span>;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {required ? <Required /> : <Optional />}
      </Label>
      {children}
    </div>
  );
}

// ===== Main page =====

export function ProjectsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<ProjForm>(EMPTY_FORM);
  const [savedFormStr, setSavedFormStr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty = isNew
    ? JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)
    : savedFormStr !== null && JSON.stringify(form) !== savedFormStr;

  useDirtyGuard(isDirty);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });

  const { data: chars } = useQuery({
    queryKey: ["characters"],
    queryFn: () => api.characters.list(),
  });

  const { data: genresData } = useQuery({
    queryKey: ["genres"],
    queryFn: () => api.genres.list(),
  });

  const { data: stylesData } = useQuery({
    queryKey: ["styles"],
    queryFn: () => api.styles.list(),
  });

  const genres = genresData?.items ?? [];
  const styles = stylesData?.items ?? [];
  const charKeys = (chars?.items as CharacterConfig[] | undefined)?.map((c) => c.key) ?? [];

  // Determine extra_fields for the currently selected genre
  const selectedGenre = genres.find((g) => g.genre_id === form.GENRE_ID) as GenreConfig | undefined;
  const extraFields = selectedGenre?.extra_fields ?? [];
  const showOssDiveFields = extraFields.includes("REPO_ROOT_PATH") || extraFields.includes("DEEP_DIVE_FOCUS");

  const saveMutation = useMutation({
    mutationFn: (f: ProjForm) => {
      const data = formToProj(f, extraFields);
      return isNew ? api.projects.create(data) : api.projects.update(f.PROJECT_ID, data);
    },
    onSuccess: (_, f) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setError(null);
      setSuccess(true);
      setSavedFormStr(JSON.stringify(f));
      if (isNew) {
        setIsNew(false);
        setSelected(f.PROJECT_ID);
      }
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : String(e));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setSelected(null);
      setIsNew(false);
      setForm(EMPTY_FORM);
      setSavedFormStr(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.title : String(e));
    },
  });

  function selectProject(p: ProjectConfig) {
    if (isDirty && !window.confirm("未保存の変更があります。変更を破棄しますか？")) return;
    const f = projToForm(p);
    setSelected(p.PROJECT_ID);
    setIsNew(false);
    setForm(f);
    setSavedFormStr(JSON.stringify(f));
    setError(null);
    setSuccess(false);
  }

  function startNew() {
    if (isDirty && !window.confirm("未保存の変更があります。変更を破棄しますか？")) return;
    setSelected(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setSavedFormStr(null);
    setError(null);
    setSuccess(false);
  }

  function patch(p: Partial<ProjForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function changeGenre(genreId: string) {
    // Clear extra fields that may no longer apply
    patch({ GENRE_ID: genreId, REPO_ROOT_PATH: "", DEEP_DIVE_FOCUS: "" });
  }

  function addCastRow() {
    patch({ castRows: [...form.castRows, { role: "", charKey: charKeys[0] ?? "" }] });
  }

  function removeCastRow(i: number) {
    patch({ castRows: form.castRows.filter((_, idx) => idx !== i) });
  }

  function updateCastRow(i: number, p: Partial<CastRow>) {
    patch({
      castRows: form.castRows.map((r, idx) => (idx === i ? { ...r, ...p } : r)),
    });
  }

  const showEditor = isNew || selected !== null;

  return (
    <div className="flex min-h-0 gap-6">
      {/* List */}
      <div className="flex w-60 flex-shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Projects</h2>
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
            {projects?.items.map((p) => {
              const proj = p as ProjectConfig;
              return (
                <button
                  key={proj.PROJECT_ID}
                  type="button"
                  onClick={() => selectProject(proj)}
                  className={cn(
                    "rounded-md px-3 py-2 text-left text-sm transition-colors",
                    selected === proj.PROJECT_ID && !isNew
                      ? "bg-emerald-600 text-white"
                      : "hover:bg-slate-100",
                  )}
                >
                  <div className="font-medium">{proj.PROJECT_TITLE}</div>
                  <div className="text-xs opacity-60">{proj.PROJECT_ID}</div>
                </button>
              );
            })}
            {projects?.items.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">No projects</p>
            )}
          </div>
        )}
      </div>

      {/* Editor */}
      {showEditor ? (
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
          <h3 className="mb-5 text-base font-semibold">
            {isNew ? "New Project" : `Edit: ${selected}`}
          </h3>
          <div className="max-w-lg space-y-4">
            <Field label="PROJECT_ID" required>
              <Input
                value={form.PROJECT_ID}
                onChange={(e) => patch({ PROJECT_ID: e.target.value })}
                readOnly={!isNew}
                className={!isNew ? "bg-slate-50 text-slate-500" : ""}
                placeholder="e.g. my-project"
              />
            </Field>

            <Field label="PROJECT_TITLE" required>
              <Input
                value={form.PROJECT_TITLE}
                onChange={(e) => patch({ PROJECT_TITLE: e.target.value })}
                placeholder="プロジェクトタイトル"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="GENRE_ID" required>
                {genres.length > 0 ? (
                  <select
                    className={selectClass}
                    value={form.GENRE_ID}
                    onChange={(e) => changeGenre(e.target.value)}
                  >
                    <option value="">-- 選択 --</option>
                    {genres.map((g) => (
                      <option key={g.genre_id} value={g.genre_id}>
                        {g.genre_id}: {g.genre_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.GENRE_ID}
                    onChange={(e) => patch({ GENRE_ID: e.target.value })}
                    placeholder="e.g. tech-explainer"
                  />
                )}
              </Field>
              <Field label="STYLE_ID" required>
                {styles.length > 0 ? (
                  <select
                    className={selectClass}
                    value={form.STYLE_ID}
                    onChange={(e) => patch({ STYLE_ID: e.target.value })}
                  >
                    <option value="">-- 選択 --</option>
                    {styles.map((s) => (
                      <option key={s.style_id} value={s.style_id}>
                        {s.style_id}: {s.style_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.STYLE_ID}
                    onChange={(e) => patch({ STYLE_ID: e.target.value })}
                    placeholder="e.g. radio-talk"
                  />
                )}
              </Field>
            </div>

            <Field label="EPISODE_ID" required>
              <Input
                value={form.EPISODE_ID}
                onChange={(e) => patch({ EPISODE_ID: e.target.value })}
                placeholder="e.g. E01"
              />
            </Field>

            <Field label="SOURCE_MARKDOWN_PATHS" required>
              <Input
                value={form.SOURCE_MARKDOWN_PATHS}
                onChange={(e) => patch({ SOURCE_MARKDOWN_PATHS: e.target.value })}
                placeholder="data/inputs/..."
              />
            </Field>

            <Field label="AUDIENCE_BACKGROUND" required>
              <Textarea
                value={form.AUDIENCE_BACKGROUND}
                onChange={(e) => patch({ AUDIENCE_BACKGROUND: e.target.value })}
                rows={2}
                placeholder="想定読者の背景知識"
              />
            </Field>

            <Field label="AUDIENCE_LEVEL" required>
              <Input
                value={form.AUDIENCE_LEVEL}
                onChange={(e) => patch({ AUDIENCE_LEVEL: e.target.value })}
                placeholder="e.g. 初学者〜中級"
              />
            </Field>

            <Field label="AUDIENCE_INTEREST" required>
              <Textarea
                value={form.AUDIENCE_INTEREST}
                onChange={(e) => patch({ AUDIENCE_INTEREST: e.target.value })}
                rows={2}
                placeholder="読者の関心事"
              />
            </Field>

            {/* OSS Dive specific fields */}
            {showOssDiveFields && (
              <>
                <Field label="REPO_ROOT_PATH" required>
                  <Input
                    value={form.REPO_ROOT_PATH}
                    onChange={(e) => patch({ REPO_ROOT_PATH: e.target.value })}
                    placeholder="data/inputs/repos/my-project"
                  />
                </Field>

                <Field label="DEEP_DIVE_FOCUS" required>
                  <Textarea
                    value={form.DEEP_DIVE_FOCUS}
                    onChange={(e) => patch({ DEEP_DIVE_FOCUS: e.target.value })}
                    rows={2}
                    placeholder="アーキテクチャと設計思想"
                  />
                </Field>
              </>
            )}

            <Field label="BASELINE_CONTEXT_OR_EMPTY">
              <Input
                value={form.BASELINE_CONTEXT_OR_EMPTY}
                onChange={(e) => patch({ BASELINE_CONTEXT_OR_EMPTY: e.target.value })}
                placeholder="前提知識（なければ空欄）"
              />
            </Field>

            <Field label="EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY">
              <Input
                value={form.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}
                onChange={(e) => patch({ EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: e.target.value })}
                placeholder="既存台本ディレクトリ（なければ空欄）"
              />
            </Field>

            <Field label="PROJECT_BLUEPRINT_JSON_PATH">
              <Input
                value={form.PROJECT_BLUEPRINT_JSON_PATH}
                onChange={(e) => patch({ PROJECT_BLUEPRINT_JSON_PATH: e.target.value })}
                placeholder="data/projects/.../blueprint/..."
              />
            </Field>

            {/* CAST */}
            <fieldset className="rounded-md border border-slate-200 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                CAST
              </legend>
              <div className="space-y-2">
                {form.castRows.map((row, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static order
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.role}
                      onChange={(e) => updateCastRow(i, { role: e.target.value })}
                      placeholder="role (e.g. lead)"
                      className="w-32"
                    />
                    {charKeys.length > 0 ? (
                      <select
                        className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                        value={row.charKey}
                        onChange={(e) => updateCastRow(i, { charKey: e.target.value })}
                      >
                        {charKeys.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={row.charKey}
                        onChange={(e) => updateCastRow(i, { charKey: e.target.value })}
                        placeholder="character key"
                        className="flex-1"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeCastRow(i)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={addCastRow}>
                  <Plus className="h-4 w-4" />
                  Add role
                </Button>
              </div>
            </fieldset>

            <Field label="NOTES">
              <Textarea
                value={form.NOTES}
                onChange={(e) => patch({ NOTES: e.target.value })}
                rows={2}
                placeholder="備考（任意）"
              />
            </Field>

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
          プロジェクトを選択するか、New で作成してください
        </div>
      )}
    </div>
  );
}
