import { Trash2 } from "lucide-react";

import type { GenreConfig, StyleConfig } from "@/api/client";
import { SaveStatus } from "@/components/feedback/SaveStatus";
import { Button } from "@/components/ui/button";
import { Fieldset } from "@/components/ui/fieldset";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { CastRow, ProjForm } from "./projectForm";

const selectClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60";

type Props = {
  selected: string | null;
  isNew: boolean;
  form: ProjForm;
  genres: GenreConfig[];
  styles: StyleConfig[];
  charKeys: string[];
  showOssDiveFields: boolean;
  error: string | null;
  success: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onPatch: (patch: Partial<ProjForm>) => void;
  onChangeGenre: (genreId: string) => void;
  onChangeStyle: (styleId: string) => void;
  onUpdateCastRow: (index: number, patch: Partial<CastRow>) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function ProjectEditorPane({
  selected,
  isNew,
  form,
  genres,
  styles,
  charKeys,
  showOssDiveFields,
  error,
  success,
  isSaving,
  isDeleting,
  onPatch,
  onChangeGenre,
  onChangeStyle,
  onUpdateCastRow,
  onSave,
  onDelete,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <h3 className="mb-5 text-base font-semibold">
        {isNew ? "New Project" : `Edit: ${selected}`}
      </h3>
      <div className="max-w-lg space-y-4">
        <FormField
          label="PROJECT_ID"
          required
          hint={
            <>
              英小文字・数字・ハイフンのみ推奨（例: my-project）
              <br />
              ※ディレクトリ名にもなる識別子で作成後は変更不可
            </>
          }
        >
          <Input
            value={form.PROJECT_ID}
            onChange={(e) => onPatch({ PROJECT_ID: e.target.value })}
            readOnly={!isNew}
            className={!isNew ? "bg-slate-50 text-slate-500" : ""}
            placeholder="e.g. my-project"
          />
        </FormField>

        <FormField label="PROJECT_TITLE" required>
          <Input
            value={form.PROJECT_TITLE}
            onChange={(e) => onPatch({ PROJECT_TITLE: e.target.value })}
            placeholder="プロジェクトタイトル"
          />
        </FormField>

        <FormField
          label="EPISODE_ID"
          required
          hint={
            <>
              現在作業するエピソードの番号（E01, E02 … の形式）
              <br />
              スキル実行時の対象エピソードになります。
            </>
          }
        >
          <Input
            value={form.EPISODE_ID}
            onChange={(e) => onPatch({ EPISODE_ID: e.target.value })}
            placeholder="e.g. E01"
          />
        </FormField>

        <FormField
          label="SOURCE_MARKDOWN_PATHS"
          required
          hint={
            <>
              glob パターンで対象 Markdown を指定（例:
              data/inputs/books/my-book/*.md）
              <br />
              ※oss-dive ジャンルでは空欄で可
            </>
          }
        >
          <Input
            value={form.SOURCE_MARKDOWN_PATHS}
            onChange={(e) => onPatch({ SOURCE_MARKDOWN_PATHS: e.target.value })}
            placeholder="data/inputs/..."
          />
        </FormField>

        <FormField label="GENRE" required>
          {genres.length > 0 ? (
            <select
              className={selectClass}
              value={form.GENRE_ID}
              onChange={(e) => onChangeGenre(e.target.value)}
            >
              <option value="">-- 選択 --</option>
              {genres.map((g) => (
                <option key={g.genre_id} value={g.genre_id}>
                  {g.genre_name} ({g.genre_id})
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={form.GENRE_ID}
              onChange={(e) => onPatch({ GENRE_ID: e.target.value })}
              placeholder="e.g. tech-explainer"
            />
          )}
        </FormField>

        {showOssDiveFields && (
          <>
            <FormField
              label="REPO_ROOT_PATH"
              required
              hint="分析するOSSリポジトリの git clone 先ルートパスを指定（例: data/inputs/repos/my-project）。"
            >
              <Input
                value={form.REPO_ROOT_PATH}
                onChange={(e) => onPatch({ REPO_ROOT_PATH: e.target.value })}
                placeholder="data/inputs/repos/my-project"
              />
            </FormField>

            <FormField
              label="DEEP_DIVE_FOCUS"
              required
              hint="OSSの何に着目して深掘りするかを指定。ブループリント・素材・台本全体の焦点になる（例: アーキテクチャと設計思想）。"
            >
              <Textarea
                value={form.DEEP_DIVE_FOCUS}
                onChange={(e) => onPatch({ DEEP_DIVE_FOCUS: e.target.value })}
                rows={2}
                placeholder="アーキテクチャと設計思想"
              />
            </FormField>
          </>
        )}

        <FormField label="STYLE" required>
          {styles.length > 0 ? (
            <select
              className={selectClass}
              value={form.STYLE_ID}
              onChange={(e) => onChangeStyle(e.target.value)}
            >
              <option value="">-- 選択 --</option>
              {styles.map((s) => (
                <option key={s.style_id} value={s.style_id}>
                  {s.style_name} ({s.style_id})
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={form.STYLE_ID}
              onChange={(e) => onPatch({ STYLE_ID: e.target.value })}
              placeholder="e.g. radio-talk"
            />
          )}
        </FormField>

        {form.STYLE_ID && (
          <Fieldset legend="CAST">
            <div className="space-y-2">
              {form.castRows.map((row, i) => (
                <FormField
                  // biome-ignore lint/suspicious/noArrayIndexKey: static order
                  key={i}
                  label={row.role}
                  required
                >
                  {charKeys.length > 0 ? (
                    <select
                      className={selectClass}
                      value={row.charKey}
                      onChange={(e) =>
                        onUpdateCastRow(i, { charKey: e.target.value })
                      }
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
                      onChange={(e) =>
                        onUpdateCastRow(i, { charKey: e.target.value })
                      }
                      placeholder="character key"
                    />
                  )}
                </FormField>
              ))}
            </div>
          </Fieldset>
        )}

        <FormField label="AUDIENCE_BACKGROUND" required>
          <Textarea
            value={form.AUDIENCE_BACKGROUND}
            onChange={(e) => onPatch({ AUDIENCE_BACKGROUND: e.target.value })}
            rows={2}
            placeholder="想定読者の背景知識"
          />
        </FormField>

        <FormField label="AUDIENCE_LEVEL" required>
          <Input
            value={form.AUDIENCE_LEVEL}
            onChange={(e) => onPatch({ AUDIENCE_LEVEL: e.target.value })}
            placeholder="e.g. 初学者〜中級"
          />
        </FormField>

        <FormField label="AUDIENCE_INTEREST" required>
          <Textarea
            value={form.AUDIENCE_INTEREST}
            onChange={(e) => onPatch({ AUDIENCE_INTEREST: e.target.value })}
            rows={2}
            placeholder="読者の関心事"
          />
        </FormField>

        <FormField
          label="BASELINE_CONTEXT_OR_EMPTY"
          hint="台本内で「既知」として扱う具体的な前提知識（例: TypeScript での実装パターン）。AUDIENCE_BACKGROUND が「読者の属性」なら、こちらは「説明を省ける知識」。不要なら空欄。"
        >
          <Input
            value={form.BASELINE_CONTEXT_OR_EMPTY}
            onChange={(e) =>
              onPatch({ BASELINE_CONTEXT_OR_EMPTY: e.target.value })
            }
            placeholder="前提知識（なければ空欄）"
          />
        </FormField>

        <FormField
          label="EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY"
          hint="過去runの台本ディレクトリを引き継ぐ場合に指定（初回や引き継ぎ不要な場合は空欄）"
        >
          <Input
            value={form.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}
            onChange={(e) =>
              onPatch({ EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: e.target.value })
            }
            placeholder="既存台本ディレクトリ（なければ空欄）"
          />
        </FormField>

        <FormField
          label="PROJECT_BLUEPRINT_JSON_PATH"
          hint="/gen-blueprint 実行後に生成された JSON のパスを指定。初回は空欄で可。"
        >
          <Input
            value={form.PROJECT_BLUEPRINT_JSON_PATH}
            onChange={(e) =>
              onPatch({ PROJECT_BLUEPRINT_JSON_PATH: e.target.value })
            }
            placeholder="data/projects/.../blueprint/..."
          />
        </FormField>

        <FormField label="NOTES">
          <Textarea
            value={form.NOTES}
            onChange={(e) => onPatch({ NOTES: e.target.value })}
            rows={2}
            placeholder="備考（任意）"
          />
        </FormField>

        <div className="flex gap-3 pt-2">
          <SaveStatus
            onSave={onSave}
            isSaving={isSaving}
            error={error}
            success={success}
          />
          {!isNew && selected && (
            <Button
              variant="secondary"
              className="text-red-600 hover:text-red-700"
              disabled={isDeleting}
              onClick={onDelete}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
