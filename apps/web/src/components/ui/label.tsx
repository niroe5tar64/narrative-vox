import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({
  className,
  children,
  ...props
}: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is supplied by consumers when needed.
    <label
      className={cn("mb-1 block text-sm font-medium text-slate-700", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
