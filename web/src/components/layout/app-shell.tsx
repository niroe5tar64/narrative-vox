import type * as React from "react";
import { FolderCog, PlayCircle, Rows3, Settings2 } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { label: "Characters", to: "/configs/characters", icon: Settings2 },
  { label: "Projects", to: "/configs/projects", icon: FolderCog },
  { label: "Styles", to: "/configs/styles", icon: Settings2 },
  { label: "VOICEVOX", to: "/configs/voicevox", icon: Settings2 },
  { label: "Dictionaries", to: "/configs/dictionaries", icon: Settings2 },
  { label: "Pipeline", to: "/pipeline", icon: PlayCircle },
  { label: "Runs", to: "/runs", icon: Rows3 },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,_#d1fae5_0,_transparent_45%),radial-gradient(circle_at_85%_10%,_#fef3c7_0,_transparent_40%),#f8fafc] text-slate-900">
      <div className="mx-auto grid min-h-screen w-full max-w-[1400px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-slate-200/80 bg-white/70 px-5 py-6 backdrop-blur lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Narrative Vox
          </p>
          <h1 className="mt-2 text-xl font-bold tracking-tight">Frontend Console</h1>
          <nav className="mt-6 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="px-5 py-6 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
