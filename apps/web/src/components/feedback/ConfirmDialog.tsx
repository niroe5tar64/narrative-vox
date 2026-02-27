import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "続行",
  cancelLabel = "キャンセル",
  isDestructive = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className={isDestructive ? "bg-red-600 hover:bg-red-500" : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
