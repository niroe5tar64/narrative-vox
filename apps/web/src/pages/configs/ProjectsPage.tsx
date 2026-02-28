import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
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
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";
import { useFlashMessage } from "@/hooks/useFlashMessage";
import { formatApiError } from "@/lib/format-api-error";
import { queryKeys } from "@/lib/query-keys";

export function ProjectsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<ProjForm>(EMPTY_FORM);
  const [savedFormStr, setSavedFormStr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    isDestructive?: boolean;
    action: () => void;
  } | null>(null);
  const successFlash = useFlashMessage();

  const isDirty = isNew
    ? JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)
    : savedFormStr !== null && JSON.stringify(form) !== savedFormStr;

  const dirtyGuard = useDirtyGuard(isDirty);

  const { data: projects, isLoading } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => api.projects.list(),
  });

  const { data: chars } = useQuery({
    queryKey: queryKeys.characters.list(),
    queryFn: () => api.characters.list(),
  });

  const { data: genresData } = useQuery({
    queryKey: queryKeys.genres.list(),
    queryFn: () => api.genres.list(),
  });

  const { data: stylesData } = useQuery({
    queryKey: queryKeys.styles.list(),
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
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      setError(null);
      successFlash.flash();
      setSavedFormStr(JSON.stringify(f));
      if (isNew) {
        setIsNew(false);
        setSelected(f.PROJECT_ID);
      }
    },
    onError: (e) => {
      setError(formatApiError(e));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      setSelected(null);
      setIsNew(false);
      setForm(EMPTY_FORM);
      setSavedFormStr(null);
    },
    onError: (e) => {
      setError(formatApiError(e));
    },
  });

  function selectProject(p: ProjectConfig) {
    if (isDirty) {
      setConfirmState({
        title: "未保存の変更があります",
        body: "変更を破棄して別のプロジェクトを開きますか？",
        confirmLabel: "破棄して開く",
        action: () => {
          const f = projToForm(p);
          setSelected(p.PROJECT_ID);
          setIsNew(false);
          setForm(f);
          setSavedFormStr(JSON.stringify(f));
          setError(null);
        },
      });
      return;
    }
    const f = projToForm(p);
    setSelected(p.PROJECT_ID);
    setIsNew(false);
    setForm(f);
    setSavedFormStr(JSON.stringify(f));
    setError(null);
  }

  function startNew() {
    if (isDirty) {
      setConfirmState({
        title: "未保存の変更があります",
        body: "変更を破棄して新規作成を始めますか？",
        confirmLabel: "破棄して新規作成",
        action: () => {
          setSelected(null);
          setIsNew(true);
          setForm(EMPTY_FORM);
          setSavedFormStr(null);
          setError(null);
        },
      });
      return;
    }
    setSelected(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setSavedFormStr(null);
    setError(null);
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
          success={successFlash.visible}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          onPatch={patch}
          onChangeGenre={changeGenre}
          onChangeStyle={changeStyle}
          onUpdateCastRow={updateCastRow}
          onSave={() => saveMutation.mutate(form)}
          onDelete={() => {
            if (!selected) return;
            setConfirmState({
              title: "プロジェクトを削除しますか？",
              body: `"${selected}" を削除します。元に戻せません。`,
              confirmLabel: "削除",
              isDestructive: true,
              action: () => deleteMutation.mutate(selected),
            });
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          プロジェクトを選択するか、New で作成してください
        </div>
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        body={confirmState?.body ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? "続行"}
        isDestructive={confirmState?.isDestructive}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          confirmState?.action();
          setConfirmState(null);
        }}
      />
      <ConfirmDialog {...dirtyGuard.confirmDialogProps} />
    </div>
  );
}
