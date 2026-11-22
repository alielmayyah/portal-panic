import { useLayoutEffect, useRef } from 'react';
import type { Toast } from '../../core/store';
import { toastIn } from '../anim';

export interface RaceToastProps {
  /** AppState.message; null hides the toast. A new id replays the entrance for a repeated text. */
  toast: Toast | null;
}

/**
 * Visual race message. aria-hidden: screen readers hear the same text through <SrStatus>.
 */
export function RaceToast({ toast }: RaceToastProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (toast) toastIn(ref.current);
  }, [toast?.id]);
  return (
    <p ref={ref} className="race-message" aria-hidden="true" hidden={!toast?.text}>
      {toast?.text}
    </p>
  );
}
