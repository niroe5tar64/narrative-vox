import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useFlashMessage } from "@/hooks/useFlashMessage";
import { formatApiError } from "@/lib/format-api-error";

export function useConfigEditor<T>(options: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  mutationFn: (data: T) => Promise<unknown>;
  onDirtyChange?: (isDirty: boolean) => void;
}) {
  const { queryKey, queryFn, mutationFn, onDirtyChange } = options;
  const qc = useQueryClient();
  const [local, setLocal] = useState<T | null>(null);
  const [savedStr, setSavedStr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successFlash = useFlashMessage();

  const { data, isLoading } = useQuery({ queryKey, queryFn });

  useEffect(() => {
    if (data) {
      setLocal(data);
      setSavedStr(JSON.stringify(data));
    }
  }, [data]);

  const isDirty = useMemo(() => {
    if (savedStr === null || local === null) return false;
    return JSON.stringify(local) !== savedStr;
  }, [local, savedStr]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (local === null) throw new Error("No data");
      return mutationFn(local);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setError(null);
      successFlash.flash();
      setSavedStr(JSON.stringify(local));
      onDirtyChange?.(false);
    },
    onError: (e) => {
      setError(formatApiError(e));
    },
  });

  const update = useCallback((updater: (prev: T) => T) => {
    setLocal((prev) => (prev === null ? null : updater(prev)));
  }, []);

  const save = useCallback(() => {
    saveMutation.mutate();
  }, [saveMutation]);

  return {
    data: local,
    isLoading,
    update,
    isDirty,
    save,
    isSaving: saveMutation.isPending,
    error,
    success: successFlash.visible,
  };
}
