import { useCallback, useEffect, useRef, useState } from "react";

type PreviewState = Record<number, "loading" | "playing" | null>;

type ActiveAudio = {
  audio: HTMLAudioElement;
  idx: number;
  blobUrl: string;
  endedHandler: () => void;
};

export function useAudioPreview() {
  const [rowState, setRowState] = useState<PreviewState>({});
  const activeRef = useRef<ActiveAudio | null>(null);

  const stop = useCallback((idx?: number) => {
    const active = activeRef.current;
    if (!active) return;
    if (idx !== undefined && active.idx !== idx) return;

    active.audio.pause();
    active.audio.removeEventListener("ended", active.endedHandler);
    URL.revokeObjectURL(active.blobUrl);
    setRowState((prev) => ({ ...prev, [active.idx]: null }));
    activeRef.current = null;
  }, []);

  const play = useCallback(
    async (idx: number, blobUrlPromise: Promise<string>) => {
      if (activeRef.current?.idx === idx) {
        stop(idx);
        return;
      }

      stop();
      setRowState((prev) => ({ ...prev, [idx]: "loading" }));

      try {
        const blobUrl = await blobUrlPromise;
        const audio = new Audio(blobUrl);

        const endedHandler = () => {
          URL.revokeObjectURL(blobUrl);
          setRowState((prev) => ({ ...prev, [idx]: null }));
          if (activeRef.current?.idx === idx) {
            activeRef.current = null;
          }
        };

        audio.addEventListener("ended", endedHandler);
        activeRef.current = { audio, idx, blobUrl, endedHandler };
        setRowState((prev) => ({ ...prev, [idx]: "playing" }));
        await audio.play();
      } catch (error) {
        setRowState((prev) => ({ ...prev, [idx]: null }));
        throw error;
      }
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { rowState, play, stop };
}
