import type { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import {
  getAuthoringStepArgs,
  AUTHORING_STEPS,
  type AuthoringStepKey,
} from "@/lib/pipeline-steps";
import { PipelineStepList } from "./PipelineStepList";

type Availability = ReturnType<typeof usePipelineAvailability>;

type Props = {
  projectId: string;
  episodeId: string;
  availability: Availability;
  copiedStep: string | null;
  copiedVisible: boolean;
  onRunStep: (stepKey: AuthoringStepKey) => void;
  onCancel: () => void;
  onCopyStep: (stepKey: string, command: string) => void;
  onPreviewCommand: (command: string | null) => void;
};

export function PipelineAuthoringPanel({
  projectId,
  episodeId,
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
      title="Authoring Pipeline（claude --print 経由）"
      steps={AUTHORING_STEPS}
      getStepStatus={(stepKey) =>
        availability.getAuthoringStepDisplayStatus(stepKey as AuthoringStepKey)
      }
      canRunStep={(stepKey) =>
        !!projectId &&
        availability.canRunAuthoringStep(stepKey as AuthoringStepKey)
      }
      getDisabledReason={() =>
        !projectId
          ? "project を選択してください"
          : availability.getAuthoringDisabledReason()
      }
      isNextStep={(index, stepKey) =>
        availability.isNextAuthoringStep(index, stepKey as AuthoringStepKey)
      }
      onRunStep={(stepKey) => onRunStep(stepKey as AuthoringStepKey)}
      onCancel={onCancel}
      commandForStep={(stepKey) => {
        if (!projectId) return null;
        const args = getAuthoringStepArgs(
          stepKey as AuthoringStepKey,
          projectId,
          episodeId,
        );
        return `bun run ${stepKey} -- ${args.join(" ")}`;
      }}
      copiedStep={copiedVisible ? copiedStep : null}
      onCopyStep={onCopyStep}
      onPreviewCommand={onPreviewCommand}
    />
  );
}
