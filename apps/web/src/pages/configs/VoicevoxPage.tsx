import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/api/client";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { SpeedProfilesEditor } from "@/components/configs/voicevox/SpeedProfilesEditor";
import { SynthesisDefaultsEditor } from "@/components/configs/voicevox/SynthesisDefaultsEditor";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TabBar } from "@/components/ui/tab-bar";
import { Textarea } from "@/components/ui/textarea";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";
import { useFlashMessage } from "@/hooks/useFlashMessage";
import { formatApiError } from "@/lib/format-api-error";
import { queryKeys } from "@/lib/query-keys";

type Tab = "synthesis-defaults" | "build-text-config" | "speed-profiles";

const TABS: { id: Tab; label: string }[] = [
  { id: "synthesis-defaults", label: "Synthesis Defaults" },
  { id: "build-text-config", label: "Build Text Config" },
  { id: "speed-profiles", label: "Speed Profiles" },
];

function JsonEditor({
  configName,
  onDirtyChange,
}: {
  configName: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [savedStr, setSavedStr] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successFlash = useFlashMessage();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.voicevox.config(configName),
    queryFn: () => api.voicevox.getConfig(configName),
  });

  useEffect(() => {
    if (data !== undefined) {
      const str = JSON.stringify(data, null, 2);
      setText(str);
      setSavedStr(str);
    }
  }, [data]);

  useEffect(() => {
    if (savedStr === null) return;
    onDirtyChange(text !== savedStr);
  }, [text, savedStr, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON");
      }
      return api.voicevox.putConfig(configName, parsed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.voicevox.config(configName) });
      setError(null);
      successFlash.flash();
      setSavedStr(text);
      onDirtyChange(false);
    },
    onError: (e) => {
      setError(formatApiError(e));
    },
  });

  const handleChange = (v: string) => {
    setText(v);
    try {
      JSON.parse(v);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      <Textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={24}
        className="font-mono text-xs"
      />
      {jsonError && <p className="text-sm text-amber-600">{jsonError}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successFlash.visible && (
        <p className="text-sm text-emerald-600">Saved successfully.</p>
      )}
      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || !!jsonError}
      >
        {saveMutation.isPending ? (
          <Spinner className="mr-1" />
        ) : (
          <Save className="mr-1 h-4 w-4" />
        )}
        Save
      </Button>
    </div>
  );
}

export function VoicevoxPage() {
  const [tab, setTab] = useState<Tab>("synthesis-defaults");
  const [dirtyEditors, setDirtyEditors] = useState<
    Partial<Record<Tab, boolean>>
  >({});
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  const isDirty = Object.values(dirtyEditors).some(Boolean);
  useDirtyGuard(isDirty);

  const handleDirtyChange = useCallback((editorTab: Tab, dirty: boolean) => {
    setDirtyEditors((prev) => ({ ...prev, [editorTab]: dirty }));
  }, []);

  const handleSynthesisDefaultsDirtyChange = useCallback(
    (d: boolean) => handleDirtyChange("synthesis-defaults", d),
    [handleDirtyChange],
  );
  const handleBuildTextConfigDirtyChange = useCallback(
    (d: boolean) => handleDirtyChange("build-text-config", d),
    [handleDirtyChange],
  );
  const handleSpeedProfilesDirtyChange = useCallback(
    (d: boolean) => handleDirtyChange("speed-profiles", d),
    [handleDirtyChange],
  );

  function switchTab(t: Tab) {
    if (dirtyEditors[tab]) {
      setPendingTab(t);
      return;
    }
    setTab(t);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">VOICEVOX Config</h2>

      <TabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={switchTab}
        dirtyMap={dirtyEditors}
      />

      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
        {tab === "synthesis-defaults" && (
          <SynthesisDefaultsEditor
            configName="synthesis-defaults"
            onDirtyChange={handleSynthesisDefaultsDirtyChange}
          />
        )}
        {tab === "build-text-config" && (
          <JsonEditor
            configName="build-text-config"
            onDirtyChange={handleBuildTextConfigDirtyChange}
          />
        )}
        {tab === "speed-profiles" && (
          <SpeedProfilesEditor
            configName="speed-profiles"
            onDirtyChange={handleSpeedProfilesDirtyChange}
          />
        )}
      </div>

      <ConfirmDialog
        open={pendingTab !== null}
        title="未保存の変更があります"
        body="変更を破棄してタブを切り替えますか？"
        confirmLabel="破棄して切り替え"
        onCancel={() => setPendingTab(null)}
        onConfirm={() => {
          if (!pendingTab) return;
          setDirtyEditors((prev) => ({ ...prev, [tab]: false }));
          setTab(pendingTab);
          setPendingTab(null);
        }}
      />
    </div>
  );
}
