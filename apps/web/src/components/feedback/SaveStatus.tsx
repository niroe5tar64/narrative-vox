import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SaveStatus({
  onSave,
  isSaving,
  disabled,
  error,
  success,
}: {
  onSave: () => void;
  isSaving: boolean;
  disabled?: boolean;
  error: string | null;
  success: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button onClick={onSave} disabled={isSaving || disabled}>
        {isSaving ? <Spinner className="mr-1" /> : <Save className="mr-1 h-4 w-4" />}
        Save
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Saved successfully.</p>}
    </div>
  );
}
