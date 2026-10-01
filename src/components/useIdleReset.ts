import { useEffect, useRef, useState } from 'react';
import { GAME_CONFIG } from '../game/config';

// En desarrollo se puede acortar para probar: ?idleSeconds=5&idleWarningSeconds=3
const readSeconds = (param: string, fallback: number): number => {
  const value = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get(param)) : 0;
  return value > 0 ? value : fallback;
};

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;

interface IdleResetOptions {
  // Si no hay nada que reiniciar (todo en su estado inicial), no se muestra el aviso.
  hasSomethingToReset: () => boolean;
  onReset: () => void;
}

// Kiosko: tras idleSeconds sin actividad pregunta "Segues aí?" y, si nadie responde en
// idleWarningSeconds, reinicia. Cualquier actividad (también en el canvas) cancela el aviso.
export const useIdleReset = ({ hasSomethingToReset, onReset }: IdleResetOptions): number | null => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const options = useRef({ hasSomethingToReset, onReset });
  options.current = { hasSomethingToReset, onReset };

  useEffect(() => {
    const idleMs = readSeconds('idleSeconds', GAME_CONFIG.idleSeconds) * 1000;
    const warningMs = readSeconds('idleWarningSeconds', GAME_CONFIG.idleWarningSeconds) * 1000;

    const handleActivity = () => {
      lastActivity.current = Date.now();
      setCountdown(null);
    };

    const tick = () => {
      const elapsed = Date.now() - lastActivity.current;

      if (elapsed < idleMs || !options.current.hasSomethingToReset()) {
        setCountdown(null);
        return;
      }

      const remainingMs = idleMs + warningMs - elapsed;

      if (remainingMs <= 0) {
        lastActivity.current = Date.now();
        setCountdown(null);
        options.current.onReset();
        return;
      }

      setCountdown(Math.ceil(remainingMs / 1000));
    };

    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, handleActivity, { passive: true }));
    const interval = window.setInterval(tick, 250);

    return () => {
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, handleActivity));
      window.clearInterval(interval);
    };
  }, []);

  return countdown;
};
