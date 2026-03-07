import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { usePipelineLog } from "@/hooks/usePipelineLog";
import { formatApiError } from "@/lib/format-api-error";
import type { StepKey, StepStatus } from "@/lib/pipeline-steps";

export function usePipelineJob(options: {
  onGenSourceIndexDone: () => Promise<void>;
  onRunStatusRefresh: () => Promise<void>;
}) {
  const { onGenSourceIndexDone, onRunStatusRefresh } = options;

  const [stepStatuses, setStepStatuses] = useState<
    Partial<Record<StepKey, StepStatus>>
  >({});
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { logs, status, reset } = usePipelineLog(jobId);

  const activeStepRef = useRef(activeStep);
  activeStepRef.current = activeStep;
  const runningCommandRef = useRef(runningCommand);
  runningCommandRef.current = runningCommand;

  const runMutation = useMutation({
    mutationFn: ({ command, args }: { command: string; args: string[] }) =>
      api.pipeline.run(command, args),
    onSuccess: (result) => {
      setJobId(result.jobId);
      setRunningCommand(result.command);
      setApiError(null);
    },
    onError: (e) => {
      setApiError(formatApiError(e));
      const activeStep = activeStepRef.current;
      if (activeStep) {
        setStepStatuses((prev) => ({
          ...prev,
          [activeStep]: "error",
        }));
        setActiveStep(null);
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!jobId) return Promise.resolve(null);
      return api.pipeline.cancel(jobId);
    },
  });

  useEffect(() => {
    const step = activeStepRef.current;
    const cmd = runningCommandRef.current;

    if (status === "done") {
      if (step) {
        setStepStatuses((prev) => ({ ...prev, [step]: "done" }));
        setActiveStep(null);

        if (step === "gen-source-index") {
          onGenSourceIndexDone().catch(() => {});
        }
        onRunStatusRefresh().catch(() => {});
      } else if (cmd === "build-all") {
        setStepStatuses((prev) => ({
          ...prev,
          "build-text": "done",
          "patch-voicevox-text": "done",
          "build-project": "done",
        }));
      }
    } else if (status === "error" || status === "cancelled") {
      if (step) {
        setStepStatuses((prev) => ({ ...prev, [step]: "error" }));
        setActiveStep(null);
      }
    }
  }, [onGenSourceIndexDone, onRunStatusRefresh, status]);

  const resetStatuses = () => {
    setStepStatuses({});
    setActiveStep(null);
    setJobId(null);
    setRunningCommand(null);
    setApiError(null);
    reset();
  };

  const startJob = (command: string, args: string[]) => {
    reset();
    setJobId(null);
    setRunningCommand(null);
    setApiError(null);
    runMutation.mutate({ command, args });
  };

  const startStepJob = (stepKey: StepKey, command: string, args: string[]) => {
    setActiveStep(stepKey);
    setStepStatuses((prev) => ({ ...prev, [stepKey]: "running" }));
    startJob(command, args);
  };

  const cancel = () => {
    cancelMutation.mutate();
  };

  const getStepStatus = (stepKey: StepKey): StepStatus =>
    stepStatuses[stepKey] ?? "idle";

  return {
    logs,
    logStatus: status,
    runningCommand,
    apiError,
    isJobActive: status === "connecting" || status === "running",
    stepStatuses,
    getStepStatus,
    startJob,
    startStepJob,
    cancel,
    resetStatuses,
  };
}
