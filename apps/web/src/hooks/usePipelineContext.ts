import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import {
  buildEpisodeOptions,
  resolveEpisodeSelection,
} from "@/lib/pipeline-episode-selection";
import { derivePaths } from "@/lib/pipeline-steps";
import { queryKeys } from "@/lib/query-keys";

export function usePipelineContext(isJobActiveForQuery: boolean) {
  const [projectId, setProjectId] = useState("");
  const [runKey, setRunKey] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [pendingAutoSelectRun, setPendingAutoSelectRun] = useState(false);

  const runIdFromKey = runKey ? runKey.slice(runKey.indexOf("/") + 1) : "";
  const paths = useMemo(
    () => derivePaths(runKey, episodeId),
    [runKey, episodeId],
  );

  const voicevoxQuery = useQuery({
    queryKey: queryKeys.voicevox.status(),
    queryFn: api.voicevox.status,
    refetchInterval: 30_000,
    retry: false,
  });

  const runStatusQuery = useQuery({
    queryKey: queryKeys.runs.status(projectId, runIdFromKey),
    queryFn: () => api.runs.status(projectId, runIdFromKey),
    enabled: !!projectId && !!runIdFromKey,
    staleTime: 10_000,
    refetchInterval: isJobActiveForQuery ? 5_000 : false,
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: api.projects.list,
    staleTime: 60_000,
  });

  const runsQuery = useQuery({
    queryKey: queryKeys.runs.byProject(projectId),
    queryFn: () =>
      api.runs.list({ projectId: projectId || undefined, pageSize: 50 }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!pendingAutoSelectRun || !runsQuery.data) return;
    const items = runsQuery.data.items.filter(
      (r) => !projectId || r.projectId === projectId,
    );
    if (items.length === 0) return;
    const newest = items[0];
    const newKey = `${newest.projectId}/${newest.runId}`;
    if (newKey !== runKey) {
      setRunKey(newKey);
    }
    setPendingAutoSelectRun(false);
  }, [pendingAutoSelectRun, runsQuery.data, projectId, runKey]);

  const episodeOptions = useMemo(
    () =>
      buildEpisodeOptions({
        runKey,
        currentEpisodeId: episodeId,
        runStatus: runStatusQuery.data,
      }),
    [episodeId, runKey, runStatusQuery.data],
  );

  const resolvedEpisodeId = useMemo(
    () =>
      resolveEpisodeSelection({
        runKey,
        currentEpisodeId: episodeId,
        runStatus: runStatusQuery.data,
      }),
    [episodeId, runKey, runStatusQuery.data],
  );

  useEffect(() => {
    if (resolvedEpisodeId !== episodeId) {
      setEpisodeId(resolvedEpisodeId);
    }
  }, [episodeId, resolvedEpisodeId]);

  return {
    projectId,
    runKey,
    episodeId,
    episodeOptions,
    setProjectId,
    setRunKey,
    setEpisodeId,
    requestAutoSelectRun: () => setPendingAutoSelectRun(true),
    runIdFromKey,
    paths,
    voicevoxQuery,
    runStatusQuery,
    projectsQuery,
    runsQuery,
  };
}
