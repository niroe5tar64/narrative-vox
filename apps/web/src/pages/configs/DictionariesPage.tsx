import { useState } from "react";
import { UserDictSection } from "@/components/configs/dictionaries/UserDictSection";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";

export function DictionariesPage() {
  const [userDirty, setUserDirty] = useState(false);
  const dirtyGuard = useDirtyGuard(userDirty);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">Dictionaries</h2>
      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur space-y-8">
        <UserDictSection onDirtyChange={setUserDirty} />
      </div>
      <ConfirmDialog {...dirtyGuard.confirmDialogProps} />
    </div>
  );
}
