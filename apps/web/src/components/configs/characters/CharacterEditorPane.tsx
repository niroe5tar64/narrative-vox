import { Save, Trash2 } from "lucide-react";

import type { Speaker, SpeakerInfo } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Fieldset } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import type { CharForm, EmotionRow } from "./characterForm";
import { VoiceSettingsSection } from "./VoiceSettingsSection";

type Props = {
  selected: string | null;
  isNew: boolean;
  form: CharForm;
  speakers: Speaker[];
  speakerInfoMap: Record<string, SpeakerInfo>;
  isVvRunning: boolean;
  error: string | null;
  success: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onPatch: (patch: Partial<CharForm>) => void;
  onUpdateEmotionRow: (index: number, patch: Partial<EmotionRow>) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function CharacterEditorPane({
  selected,
  isNew,
  form,
  speakers,
  speakerInfoMap,
  isVvRunning,
  error,
  success,
  isSaving,
  isDeleting,
  onPatch,
  onUpdateEmotionRow,
  onSave,
  onDelete,
}: Props) {
  let profileJsonError: string | null = null;
  try {
    JSON.parse(form.profileJson);
  } catch (e) {
    profileJsonError = e instanceof Error ? e.message : "Invalid JSON";
  }

  return (
    <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <h3 className="mb-5 text-base font-semibold">
        {isNew ? "New Character" : `Edit: ${selected}`}
      </h3>
      <div className="max-w-lg space-y-4">
        <div>
          <Label htmlFor="char-key">Key</Label>
          <Input
            id="char-key"
            value={form.key}
            onChange={(e) => onPatch({ key: e.target.value })}
            readOnly={!isNew}
            className={!isNew ? "bg-slate-50 text-slate-500" : ""}
            placeholder="e.g. narrator"
          />
        </div>

        <div>
          <Label htmlFor="char-name">Name</Label>
          <Input
            id="char-name"
            value={form.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="表示名"
          />
        </div>

        <div>
          <Label htmlFor="char-desc">Description</Label>
          <Textarea
            id="char-desc"
            value={form.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="キャラクターの説明（任意）"
            rows={2}
          />
        </div>

        <VoiceSettingsSection
          form={form}
          speakers={speakers}
          speakerInfoMap={speakerInfoMap}
          isVvRunning={isVvRunning}
          onPatch={onPatch}
          onUpdateEmotionRow={onUpdateEmotionRow}
        />

        <Fieldset legend="Profile (JSON)">
          <Textarea
            value={form.profileJson}
            onChange={(e) => onPatch({ profileJson: e.target.value })}
            rows={20}
            className="font-mono text-xs"
            spellCheck={false}
          />
          {profileJsonError && (
            <p className="mt-1 text-xs text-red-600">{profileJsonError}</p>
          )}
        </Fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-600">Saved successfully.</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? (
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
