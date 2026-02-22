import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface VoicePreviewButtonProps {
  voiceSample?: string;
  className?: string;
}

export function VoicePreviewButton({
  voiceSample,
  className,
}: VoicePreviewButtonProps) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  function handleClick() {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }

    if (!voiceSample) return;

    const audio = new Audio(`data:audio/wav;base64,${voiceSample}`);
    audioRef.current = audio;
    audio.play();
    setPlaying(true);
    audio.addEventListener("ended", () => {
      audioRef.current = null;
      setPlaying(false);
    });
  }

  return (
    <button
      type="button"
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50",
        playing && "text-emerald-600",
        className,
      )}
      disabled={!voiceSample}
      onClick={handleClick}
    >
      {playing ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
