import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { useState } from "react";

import type { TreeNode } from "@narrative-vox/api-types";
import { cn } from "@/lib/utils";

type Props = {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
};

export function RunFileTree({
  node,
  selectedPath,
  onSelect,
  depth = 0,
}: Props) {
  // Auto-expand root and first-level dirs
  const [open, setOpen] = useState(depth < 2);

  if (node.type === "file") {
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={cn(
          "w-full text-left flex items-center gap-1.5 rounded py-1 text-xs font-mono transition-colors hover:bg-slate-100",
          selectedPath === node.path &&
            "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <File className="size-3 flex-shrink-0 text-slate-400" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  // Root dir: just render children without a toggle
  if (depth === 0) {
    return (
      <div>
        {node.children.map((child) => (
          <RunFileTree
            key={child.name}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={1}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center gap-1.5 rounded py-1 text-xs font-mono text-slate-600 hover:bg-slate-100 transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {open ? (
          <ChevronDown className="size-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="size-3 flex-shrink-0" />
        )}
        <Folder className="size-3 flex-shrink-0 text-amber-400" />
        <span className="font-medium">{node.name}</span>
      </button>
      {open && (
        <div>
          {node.children.map((child) => (
            <RunFileTree
              key={child.name}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
