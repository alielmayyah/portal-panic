import type { Action } from '../../core/types';
import { useEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

export type TouchAction = Action;

export interface TouchRunner {
  name: string;
  color: string;
  /** 0 shows the Missile button as empty. */
  missiles: number;
}

export interface TouchControlsProps {
  runners: readonly TouchRunner[];
  versus: boolean;
  /** True while the phase is 'ready' | 'running' | 'crossing'; presses are ignored otherwise. */
  active: boolean;
  /** A finger (or mouse) went down on a button, or rocked onto another arrow. */
  onPress: (runner: number, action: TouchAction, pointerId: number) => void;
  /** That pointer is no longer holding its button. */
  onRelease: (pointerId: number) => void;
  /** Keyboard or assistive-tech activation (a click with no pointer). The app accepts it only while running. */
  onTap?: (runner: number, action: TouchAction) => void;
  /** Change it (pause, finish, home) to drop every held finger. onRelease fires for each. */
  resetKey?: unknown;
}

const BUTTONS: { action: TouchAction; label: string; aria: string }[] = [
  { action: 'left', label: '←', aria: 'move left' },
  { action: 'right', label: '→', aria: 'move right' },
  { action: 'duck', label: 'Duck', aria: 'duck' },
  { action: 'jump', label: 'Jump', aria: 'jump' },
  { action: 'fire', label: 'Blast', aria: 'fire blaster' },
  { action: 'missile', label: 'Missile', aria: 'fire missile' },
];

interface Finger {
  runner: number;
  action: TouchAction;
  target: HTMLElement;
}

export function TouchControls({ runners, versus, active, onPress, onRelease, onTap, resetKey }: TouchControlsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, Finger>());
  const live = useRef({ active, onPress, onRelease });
  live.current = { active, onPress, onRelease };

  const hold = (pointerId: number, target: HTMLElement, runner: number, action: TouchAction) => {
    fingers.current.set(pointerId, { runner, action, target });
    target.dataset.held = '';
    try {
      target.setPointerCapture?.(pointerId);
    } catch {
      /* the pointer may already be gone */
    }
    live.current.onPress(runner, action, pointerId);
  };

  const release = (pointerId: number) => {
    const finger = fingers.current.get(pointerId);
    if (!finger) return;
    fingers.current.delete(pointerId);
    if (![...fingers.current.values()].some(({ target }) => target === finger.target)) delete finger.target.dataset.held;
    live.current.onRelease(pointerId);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-touch]');
    if (!button || event.button !== 0 || !live.current.active) return;
    event.preventDefault();
    hold(event.pointerId, button, Number(button.dataset.runner), button.dataset.touch as TouchAction);
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-touch]');
    if (!button || event.detail !== 0) return;
    onTap?.(Number(button.dataset.runner), button.dataset.touch as TouchAction);
  };

  useEffect(() => {
    const onEnd = (event: PointerEvent) => {
      const finger = fingers.current.get(event.pointerId);
      // A capture handed to another d-pad button reports a stale loss on the previous one.
      if (!finger || (event.type === 'lostpointercapture' && event.target !== finger.target)) return;
      release(event.pointerId);
    };
    // Rocking a thumb between ← and → switches direction without lifting it.
    const onMove = (event: PointerEvent) => {
      const finger = fingers.current.get(event.pointerId);
      if (!finger || event.pointerType !== 'touch' || (finger.action !== 'left' && finger.action !== 'right')) return;
      const next = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-touch="left"], [data-touch="right"]');
      if (!next || next === finger.target || !rootRef.current?.contains(next)) return;
      if (Number(next.dataset.runner) !== finger.runner || !live.current.active) return;
      release(event.pointerId);
      hold(event.pointerId, next, finger.runner, next.dataset.touch as TouchAction);
    };
    const ends = ['pointerup', 'pointercancel', 'lostpointercapture'] as const;
    for (const name of ends) window.addEventListener(name, onEnd);
    window.addEventListener('pointermove', onMove);
    return () => {
      for (const name of ends) window.removeEventListener(name, onEnd);
      window.removeEventListener('pointermove', onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop held fingers on pause/finish/home (and on unmount).
  useEffect(
    () => () => {
      for (const id of [...fingers.current.keys()]) release(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey],
  );

  return (
    <div
      ref={rootRef}
      className={`touch-controls${versus ? ' is-versus' : ''}`}
      role="group"
      aria-label="Touch controls"
      onPointerDown={onPointerDown}
      onClick={onClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      {runners.map((runner, index) => (
        <div
          key={runner.name + index}
          style={{ '--pilot': runner.color } as CSSProperties}
          role="group"
          aria-label={`${runner.name} controls`}
        >
          {versus && <span>{runner.name}</span>}
          {BUTTONS.map(({ action, label, aria }) => (
            <button
              key={action}
              type="button"
              tabIndex={-1}
              data-touch={action}
              data-runner={index}
              className={action === 'missile' && runner.missiles === 0 ? 'is-empty' : undefined}
              aria-label={`${runner.name} ${aria}`}
            >
              {label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
