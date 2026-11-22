import { useLayoutEffect, useRef } from 'react';
import type { Countdown as CountdownData } from '../../core/store';
import { crossingTitle, popCountdown } from '../anim';

/** AppState.countdown: {kind: 'ready'|'crossing', label, text}. Spread it: <Countdown {...countdown} />. */
export type CountdownProps = CountdownData;

/** Overlay centred on the course. Render it only while the phase is 'ready' or 'crossing'. */
export function Countdown({ kind, label, text }: CountdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const strongRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const anim = kind === 'crossing' ? crossingTitle(rootRef.current) : popCountdown(strongRef.current);
    return () => {
      anim?.kill();
    };
  }, [kind, text]);

  return (
    <div ref={rootRef} className={`countdown${kind === 'crossing' ? ' portal-crossing' : ''}`}>
      <small>{label}</small>
      <strong ref={strongRef}>{text}</strong>
    </div>
  );
}
