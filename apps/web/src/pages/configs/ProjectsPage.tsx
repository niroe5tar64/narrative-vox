import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ApiError,
  api,
  type CharacterConfig,
  type GenreConfig,
  type ProjectConfig,
  type StyleConfig,
} from "@/api/client";
import { ProjectEditorPane } from "@/components/configs/projects/ProjectEditorPane";
import { ProjectsListPane } from "@/components/configs/projects/ProjectsListPane";
import {
  EMPTY_FORM,
  formToProj,
  type ProjForm,
  projToForm,
} from "@/components/configs/projects/projectForm";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";

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

  const projectItems = (projects?.items ?? []) as ProjectConfig[];
  const genres = (genresData?.items ?? []) as GenreConfig[];
  const styles = (stylesData?.items ?? []) as StyleConfig[];
  const charKeys =
    (chars?.items as CharacterConfig[] | undefined)?.map((c) => c.key) ?? [];

  const selectedGenre = genres.find((g) => g.genre_id === form.GENRE_ID);
  const extraFields = selectedGenre?.extra_fields ?? [];
  const showOssDiveFields =
    extraFields.includes("REPO_ROOT_PATH") ||
    extraFields.includes("DEEP_DIVE_FOCUS");

  const saveMutation = useMutation({
    mutationFn: (f: ProjForm) => {
      const data = formToProj(f, extraFields);
      return isNew
        ? api.projects.create(data)
        : api.projects.update(f.PROJECT_ID, data);
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
      setError(
        e instanceof ApiError
          ? `${e.title}${e.detail ? `: ${e.detail}` : ""}`
          : String(e),
      );
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
    if (
      isDirty &&
      !window.confirm("未保存の変更があります。変更を破棄しますか？")
    )
      return;
    const f = projToForm(p);
    setSelected(p.PROJECT_ID);
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

  function patch(patchForm: Partial<ProjForm>) {
    setForm((f) => ({ ...f, ...patchForm }));
  }

  function changeGenre(genreId: string) {
    patch({ GENRE_ID: genreId, REPO_ROOT_PATH: "", DEEP_DIVE_FOCUS: "" });
  }

  function changeStyle(styleId: string) {
    const style = styles.find((s) => s.style_id === styleId);
    const newCastRows = (style?.format.speaker_roles ?? []).map((sr) => {
      const existing = form.castRows.find((r) => r.role === sr.role);
      return { role: sr.role, charKey: existing?.charKey ?? charKeys[0] ?? "" };
    });
    patch({ STYLE_ID: styleId, castRows: newCastRows });
  }

  function updateCastRow(
    i: number,
    patchRow: { role?: string; charKey?: string },
  ) {
    patch({
      castRows: form.castRows.map((r, idx) =>
        idx === i ? { ...r, ...patchRow } : r,
      ),
    });
  }

  const showEditor = isNew || selected !== null;

  return (
    <div className="flex min-h-0 gap-6">
      <ProjectsListPane
        projects={projectItems}
        selected={selected}
        isNew={isNew}
        isLoading={isLoading}
        onSelect={selectProject}
        onStartNew={startNew}
      />

      {showEditor ? (
        <ProjectEditorPane
          selected={selected}
          isNew={isNew}
          form={form}
          genres={genres}
          styles={styles}
          charKeys={charKeys}
          showOssDiveFields={showOssDiveFields}
          error={error}
          success={success}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          onPatch={patch}
          onChangeGenre={changeGenre}
          onChangeStyle={changeStyle}
          onUpdateCastRow={updateCastRow}
          onSave={() => saveMutation.mutate(form)}
          onDelete={() => {
            if (selected && window.confirm(`"${selected}" を削除しますか？`)) {
              deleteMutation.mutate(selected);
            }
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          プロジェクトを選択するか、New で作成してください
        </div>
      )}
    </div>
  );
}
