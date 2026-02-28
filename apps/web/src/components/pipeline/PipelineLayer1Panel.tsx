import type { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import {
  getLayer1StepArgs,
  LAYER1_STEPS,
  type Layer1StepKey,
} from "@/lib/pipeline-steps";
import { PipelineStepList } from "./PipelineStepList";

type Availability = ReturnType<typeof usePipelineAvailability>;

type Props = {
  projectId: string;
  episodeId: string;
  runDir: string;
  availability: Availability;
  copiedStep: string | null;
  copiedVisible: boolean;
  onRunStep: (stepKey: Layer1StepKey) => void;
  onCancel: () => void;
  onCopyStep: (stepKey: string, command: string) => void;
  onPreviewCommand: (command: string | null) => void;
};

export function PipelineLayer1Panel({
  projectId,
  episodeId,
  runDir,
  availability,
  copiedStep,
  copiedVisible,
  onRunStep,
  onCancel,
  onCopyStep,
  onPreviewCommand,
}: Props) {
  return (
    <PipelineStepList
      title="Layer 1 — LLM 生成（claude --print 経由）"
      steps={LAYER1_STEPS}
      getStepStatus={(stepKey) =>
        availability.getLayer1StepDisplayStatus(stepKey as Layer1StepKey)
      }
      canRunStep={(stepKey) =>
        !!projectId && availability.canRunLayer1Step(stepKey as Layer1StepKey)
      }
      getDisabledReason={() =>
        !projectId
          ? "project を選択してください"
          : availability.getLayer1DisabledReason()
      }
      isNextStep={(index, stepKey) =>
        availability.isNextLayer1Step(index, stepKey as Layer1StepKey)
      }
      onRunStep={(stepKey) => onRunStep(stepKey as Layer1StepKey)}
      onCancel={onCancel}
      commandForStep={(stepKey) => {
        if (!projectId) return null;
        const args = getLayer1StepArgs(
          stepKey as Layer1StepKey,
          projectId,
          episodeId,
          runDir,
        );
        return `bun run ${stepKey} -- ${args.join(" ")}`;
      }}
      copiedStep={copiedVisible ? copiedStep : null}
      onCopyStep={onCopyStep}
      onPreviewCommand={onPreviewCommand}
    />
  );
}
