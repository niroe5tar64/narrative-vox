import { useCallback, useEffect, useRef, useState } from "react";

export function useFlashMessage(duration = 2500): {
  visible: boolean;
  flash: () => void;
} {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback(() => {
    setVisible(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setVisible(false), duration);
  }, [duration]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { visible, flash };
}
