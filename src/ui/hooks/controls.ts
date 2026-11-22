// Small app-level commands shared by buttons and the global key handler.
import { sound, unlockSound } from '../../audio/instance';
import { actions, store } from '../../core/store';
import { focusStage } from './gameHost';

export function clickSound(): void {
  unlockSound();
  sound.click();
}

export function toggleSound(): void {
  sound.setEnabled(!sound.enabled);
  if (sound.enabled) clickSound();
  actions.setSoundEnabled(sound.enabled);
}

// ---------- Fullscreen (Fullscreen API, with a CSS "window mode" fallback) ----------

let windowMode = false;
let changing = false;

export const inWindowMode = (): boolean => windowMode;

export function syncFullscreen(): void {
  const active = Boolean(document.fullscreenElement || windowMode);
  document.documentElement.classList.toggle('fullscreen-mode', active);
  actions.setFullscreen(active);
  if (active && store.getState().screen === 'game') window.scrollTo(0, 0);
}

/** Focus the course again after a header button or key changed something, unless a dialog owns focus. */
export function refocusGame(): void {
  const state = store.getState();
  if (state.screen === 'game' && !state.dialog) focusStage();
}

export async function toggleFullscreen(): Promise<void> {
  if (changing) return;
  changing = true;
  try {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* the browser still owns the fullscreen state */ }
    } else if (windowMode) windowMode = false;
    else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { windowMode = true; }
    } else windowMode = true;
  } finally {
    changing = false;
    syncFullscreen();
    refocusGame();
  }
}
