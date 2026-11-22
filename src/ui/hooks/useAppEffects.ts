// Document-level wiring the old main.js did once at startup.
import { useEffect } from 'react';
import { sound, unlockSound } from '../../audio/instance';
import { refineKeyNames } from '../../core/input';
import { actions } from '../../core/store';
import { syncFullscreen } from './controls';
import { ensureGame } from './gameHost';
import { ui } from './session';

export function useAppEffects(): void {
  useEffect(() => {
    // Boot the race game early (hidden) so Start is instant; it lives for the whole app lifetime.
    ensureGame();
    syncFullscreen();

    // Touchscreen laptops report a fine primary pointer; show the touch controls once a finger is used.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') document.documentElement.classList.add('touch-input');
    };
    // Browsers suspend audio until a gesture; wake it on the next one.
    const wakeAudio = () => {
      if (sound.enabled && sound.ctx && sound.ctx.state !== 'running') unlockSound();
    };
    // Any button press counts as the gesture that may create the AudioContext.
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button')) unlockSound();
    };
    // Keep records in step with other open tabs; values only ever go up.
    const onStorage = () => actions.syncFromStorage();

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    for (const type of ['pointerup', 'touchend', 'keydown'] as const) window.addEventListener(type, wakeAudio, { capture: true, passive: true });
    document.addEventListener('click', onClick);
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('storage', onStorage);

    let alive = true;
    void refineKeyNames().then((changed) => {
      if (alive && changed) ui.setState((s) => ({ keysVersion: s.keysVersion + 1 }));
    });

    return () => {
      alive = false;
      window.removeEventListener('pointerdown', onPointerDown);
      for (const type of ['pointerup', 'touchend', 'keydown'] as const) window.removeEventListener(type, wakeAudio, { capture: true });
      document.removeEventListener('click', onClick);
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
