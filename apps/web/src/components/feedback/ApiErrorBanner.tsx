import { cn } from "@/lib/utils";

export function ApiErrorBanner({
  error,
  className,
}: {
  error: string | null;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700",
        className,
      )}
    >
      {error}
    </div>
  );
}
