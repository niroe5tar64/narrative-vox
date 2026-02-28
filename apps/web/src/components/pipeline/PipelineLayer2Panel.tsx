import type { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import {
  getLayer2StepArgs,
  LAYER1_STEPS,
  LAYER2_STEPS,
  type Layer2StepKey,
  type Paths,
} from "@/lib/pipeline-steps";
import { PipelineShortcutPanel } from "./PipelineShortcutPanel";
import { PipelineStepList } from "./PipelineStepList";

type Availability = ReturnType<typeof usePipelineAvailability>;

type Props = {
  paths: Paths | null;
  availability: Availability;
  isAnyStepRunning: boolean;
  runningCommand: string | null;
  copiedStep: string | null;
  copiedVisible: boolean;
  onRunStep: (stepKey: Layer2StepKey) => void;
  onRunBuildAll: () => void;
  onCancel: () => void;
  onCopyStep: (stepKey: string, command: string) => void;
  onPreviewCommand: (command: string | null) => void;
};

export function PipelineLayer2Panel({
  paths,
  availability,
  isAnyStepRunning,
  runningCommand,
  copiedStep,
  copiedVisible,
  onRunStep,
  onRunBuildAll,
  onCancel,
  onCopyStep,
  onPreviewCommand,
}: Props) {
  return (
    <div className="space-y-0">
      <PipelineStepList
        title="Layer 2 — 音声合成パイプライン"
        steps={LAYER2_STEPS}
        numberingOffset={LAYER1_STEPS.length}
        getStepStatus={(stepKey) =>
          availability.getLayer2StepDisplayStatus(stepKey as Layer2StepKey)
        }
        canRunStep={(stepKey) =>
          availability.canRunLayer2Step(stepKey as Layer2StepKey)
        }
        getDisabledReason={(stepKey) =>
          availability.getLayer2DisabledReason(stepKey as Layer2StepKey)
        }
        isNextStep={(index, stepKey) =>
          availability.isNextLayer2Step(index, stepKey as Layer2StepKey)
        }
        onRunStep={(stepKey) => onRunStep(stepKey as Layer2StepKey)}
        onCancel={onCancel}
        commandForStep={(stepKey) => {
          if (!paths) return null;
          const args = getLayer2StepArgs(stepKey as Layer2StepKey, paths);
          return `bun run ${stepKey} -- ${args.join(" ")}`;
        }}
        copiedStep={copiedVisible ? copiedStep : null}
        onCopyStep={onCopyStep}
        onPreviewCommand={onPreviewCommand}
      />
      <div className="rounded-b-xl border-x border-b border-slate-200 bg-white/80 px-4 pb-4 backdrop-blur">
        <PipelineShortcutPanel
          isRunningBuildAll={isAnyStepRunning && runningCommand === "build-all"}
          canRunBuildAll={availability.canRunBuildAll}
          disabledReason={availability.buildAllDisabledReason}
          onRunBuildAll={onRunBuildAll}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
