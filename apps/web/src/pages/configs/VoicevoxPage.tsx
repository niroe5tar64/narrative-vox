import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";

import { ApiError, api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Tab = "synthesis-defaults" | "build-text-config" | "speed-profiles";

const TABS: { id: Tab; label: string }[] = [
  { id: "synthesis-defaults", label: "Synthesis Defaults" },
  { id: "build-text-config", label: "Build Text Config" },
  { id: "speed-profiles", label: "Speed Profiles" },
];

// ===== Synthesis Defaults editor =====

type QueryDefaults = {
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number | string;
  outputStereo: boolean;
};

type SynthesisDefaults = {
  appVersion: string;
  tpqn: number;
  tempoBpm: number;
  timeSignature: { beats: number; beatType: number };
  queryDefaults: QueryDefaults;
};

function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function SynthesisDefaultsEditor({ configName }: { configName: "synthesis-defaults" }) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<SynthesisDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["voicevox-config", configName],
    queryFn: () => api.voicevox.getConfig(configName),
  });

  useEffect(() => {
    if (data) setLocal(data as SynthesisDefaults);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.voicevox.putConfig(configName, local),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voicevox-config", configName] });
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : String(e));
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  function patchQD(patch: Partial<QueryDefaults>) {
    setLocal((l) => l && { ...l, queryDefaults: { ...l.queryDefaults, ...patch } });
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>appVersion</Label>
          <Input
            value={local.appVersion}
            onChange={(e) => setLocal((l) => l && { ...l, appVersion: e.target.value })}
          />
        </div>
        <NumberField
          label="tpqn"
          value={local.tpqn}
          step={1}
          onChange={(v) => setLocal((l) => l && { ...l, tpqn: v })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="tempoBpm"
          value={local.tempoBpm}
          step={1}
          onChange={(v) => setLocal((l) => l && { ...l, tempoBpm: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="beats"
            value={local.timeSignature.beats}
            step={1}
            onChange={(v) =>
              setLocal(
                (l) =>
                  l && { ...l, timeSignature: { ...l.timeSignature, beats: v } },
              )
            }
          />
          <NumberField
            label="beatType"
            value={local.timeSignature.beatType}
            step={1}
            onChange={(v) =>
              setLocal(
                (l) =>
                  l && { ...l, timeSignature: { ...l.timeSignature, beatType: v } },
              )
            }
          />
        </div>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Query Defaults
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="speedScale"
            value={local.queryDefaults.speedScale}
            onChange={(v) => patchQD({ speedScale: v })}
          />
          <NumberField
            label="pitchScale"
            value={local.queryDefaults.pitchScale}
            onChange={(v) => patchQD({ pitchScale: v })}
          />
          <NumberField
            label="intonationScale"
            value={local.queryDefaults.intonationScale}
            onChange={(v) => patchQD({ intonationScale: v })}
          />
          <NumberField
            label="volumeScale"
            value={local.queryDefaults.volumeScale}
            onChange={(v) => patchQD({ volumeScale: v })}
          />
          <NumberField
            label="pauseLengthScale"
            value={local.queryDefaults.pauseLengthScale}
            onChange={(v) => patchQD({ pauseLengthScale: v })}
          />
          <NumberField
            label="prePhonemeLength"
            value={local.queryDefaults.prePhonemeLength}
            onChange={(v) => patchQD({ prePhonemeLength: v })}
          />
          <NumberField
            label="postPhonemeLength"
            value={local.queryDefaults.postPhonemeLength}
            onChange={(v) => patchQD({ postPhonemeLength: v })}
          />
          <div>
            <Label>outputSamplingRate</Label>
            <Input
              value={String(local.queryDefaults.outputSamplingRate)}
              onChange={(e) => {
                const v = e.target.value;
                patchQD({ outputSamplingRate: v === "engineDefault" ? "engineDefault" : Number(v) });
              }}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="outputStereo"
              checked={local.queryDefaults.outputStereo}
              onChange={(e) => patchQD({ outputStereo: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <label htmlFor="outputStereo" className="text-sm text-slate-700">
              outputStereo
            </label>
          </div>
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Saved successfully.</p>}

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Spinner className="mr-1" /> : <Save className="mr-1 h-4 w-4" />}
        Save
      </Button>
    </div>
  );
}

// ===== JSON textarea editor (build-text-config) =====

function JsonEditor({ configName }: { configName: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["voicevox-config", configName],
    queryFn: () => api.voicevox.getConfig(configName),
  });

  useEffect(() => {
    if (data !== undefined) setText(JSON.stringify(data, null, 2));
  }, [data]);

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
      qc.invalidateQueries({ queryKey: ["voicevox-config", configName] });
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : e instanceof Error ? e.message : String(e));
    },
  });

  function handleChange(v: string) {
    setText(v);
    try {
      JSON.parse(v);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;

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
      {success && <p className="text-sm text-emerald-600">Saved successfully.</p>}
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !!jsonError}>
        {saveMutation.isPending ? <Spinner className="mr-1" /> : <Save className="mr-1 h-4 w-4" />}
        Save
      </Button>
    </div>
  );
}

// ===== Speed Profiles editor =====

type SpeedPreset = { speedScale: number; pauseLengthScale: number; postPhonemeLength: number };
type SpeedProfiles = { version: number; presets: Record<string, SpeedPreset> };

function SpeedProfilesEditor({ configName }: { configName: "speed-profiles" }) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<SpeedProfiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["voicevox-config", configName],
    queryFn: () => api.voicevox.getConfig(configName),
  });

  useEffect(() => {
    if (data) setLocal(data as SpeedProfiles);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.voicevox.putConfig(configName, local),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voicevox-config", configName] });
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.title}${e.detail ? `: ${e.detail}` : ""}` : String(e));
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!local) return <p className="text-sm text-slate-500">データ取得失敗</p>;

  function patchPreset(name: string, patch: Partial<SpeedPreset>) {
    setLocal(
      (l) =>
        l && {
          ...l,
          presets: { ...l.presets, [name]: { ...l.presets[name], ...patch } },
        },
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      {Object.entries(local.presets).map(([name, preset]) => (
        <fieldset key={name} className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold capitalize text-slate-700">{name}</legend>
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="speedScale"
              value={preset.speedScale}
              onChange={(v) => patchPreset(name, { speedScale: v })}
            />
            <NumberField
              label="pauseLengthScale"
              value={preset.pauseLengthScale}
              onChange={(v) => patchPreset(name, { pauseLengthScale: v })}
            />
            <NumberField
              label="postPhonemeLength"
              value={preset.postPhonemeLength}
              onChange={(v) => patchPreset(name, { postPhonemeLength: v })}
            />
          </div>
        </fieldset>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Saved successfully.</p>}

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Spinner className="mr-1" /> : <Save className="mr-1 h-4 w-4" />}
        Save
      </Button>
    </div>
  );
}

// ===== Main page =====

export function VoicevoxPage() {
  const [tab, setTab] = useState<Tab>("synthesis-defaults");

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">VOICEVOX Config</h2>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
        {tab === "synthesis-defaults" && (
          <SynthesisDefaultsEditor configName="synthesis-defaults" />
        )}
        {tab === "build-text-config" && <JsonEditor configName="build-text-config" />}
        {tab === "speed-profiles" && <SpeedProfilesEditor configName="speed-profiles" />}
      </div>
    </div>
  );
}
