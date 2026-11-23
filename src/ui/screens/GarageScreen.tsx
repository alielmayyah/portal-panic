import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type Phaser from 'phaser';
import { LEVELS } from '../../core/levels';
import { actions, type Pilot } from '../../core/store';
import type { Mode } from '../../core/types';
import { createPreview } from '../../phaser/createGame';
import { drawPortrait } from '../../phaser/draw/portrait';
import { GarageMenu } from '../components';
import { clickSound } from '../hooks/controls';
import { startRun } from '../hooks/session';
import { useStore } from '../hooks/useStore';

export interface GarageScreenProps {
  /** The app focuses this after returning from a run. */
  startRef: RefObject<HTMLButtonElement>;
}

/** Container for <GarageMenu>: store wiring, the Phaser preview and the pilot portraits. */
export function GarageScreen({ startRef }: GarageScreenProps) {
  const mode = useStore((s) => s.mode);
  const pilot = useStore((s) => s.pilot);
  const selectedLevel = useStore((s) => s.selectedLevels[s.mode]);
  const unlocked = useStore((s) => s.unlocked);
  const cleared = useStore((s) => s.cleared);
  const best = useStore((s) => s.best);
  const runs = useStore((s) => s.runs);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // The preview game follows the selected level from the store and sleeps while scrolled off-screen
  // (createPreview owns its IntersectionObserver). Creation waits a tick so StrictMode's immediate
  // mount/unmount/mount does not boot and tear down a WebGL context for nothing.
  useEffect(() => {
    const parent = previewRef.current;
    if (!parent || !previewOpen) return;
    let game: Phaser.Game | null = null;
    const timer = window.setTimeout(() => { game = createPreview(parent); }, 0);
    return () => {
      window.clearTimeout(timer);
      game?.destroy(true);
      game = null;
    };
  }, [previewOpen]);

  const drawn = useRef(new WeakSet<HTMLCanvasElement>());
  const portraitRef = useCallback((id: Pilot, canvas: HTMLCanvasElement | null) => {
    if (!canvas || drawn.current.has(canvas)) return;
    drawn.current.add(canvas);
    drawPortrait(canvas, id);
  }, []);

  const onModeChange = (next: Mode) => {
    actions.setMode(next);
    clickSound();
  };
  const onPilotChange = (next: Pilot) => {
    actions.setPilot(next);
    clickSound();
  };
  const onLevelSelect = (level: number) => {
    actions.selectLevel(mode, level);
    setPreviewOpen(true);
    clickSound();
  };

  return (
    <GarageMenu
      mode={mode}
      pilot={pilot}
      levels={LEVELS}
      selectedLevel={selectedLevel}
      unlocked={unlocked}
      cleared={cleared}
      best={best}
      runs={runs}
      previewRef={previewRef}
      previewOpen={previewOpen}
      onPreviewToggle={() => setPreviewOpen((open) => !open)}
      portraitRef={portraitRef}
      startRef={startRef}
      onModeChange={onModeChange}
      onPilotChange={onPilotChange}
      onLevelSelect={onLevelSelect}
      onStart={() => startRun(mode)}
      onShop={() => { clickSound(); actions.openShop(); }}
    />
  );
}
