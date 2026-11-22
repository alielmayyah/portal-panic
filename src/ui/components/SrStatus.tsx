import { useLayoutEffect, useRef } from 'react';

export interface SrStatusProps {
  /** Latest announcement. */
  message: string;
  /** Bump to re-announce an identical message. */
  seq?: number;
}

/**
 * Polite live region. The text is cleared and set again on every change so a repeated message
 * announces again (as announce() did in main.js).
 */
export function SrStatus({ message, seq = 0 }: SrStatusProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = '';
    el.textContent = message;
  }, [message, seq]);
  return <p ref={ref} className="sr-only" role="status" aria-live="polite" />;
}
