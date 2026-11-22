// Run commands (React -> Phaser over the bus) plus a small UI-only store for overlays the
// Phaser scene does not know about: the How to play guide and the cheat console.
import { unlockSound } from '../../audio/instance';
import { bus, createStore, store } from '../../core/store';
import type { Mode } from '../../core/types';
import type { CheatFeedback } from '../components';
import { ensureGame, focusStage } from './gameHost';

export interface UiState {
  guideOpen: boolean;
  cheatOpen: boolean;
  /** The run was 'running' (or still counting down) when the console opened: resume it on close. */
  cheatResume: boolean;
  cheatFeedback: CheatFeedback | null;
  /** Bumped when refineKeyNames() relabels keys for the player's layout, so legends re-render. */
  keysVersion: number;
}

export const ui = createStore<UiState>({ guideOpen: false, cheatOpen: false, cheatResume: false, cheatFeedback: null, keysVersion: 0 });

/** Focus the course once React has rendered the game view (and its stage). */
function focusSoon(): void {
  requestAnimationFrame(() => focusStage());
}

export function startRun(mode: Mode): void {
  const s = store.getState();
  ensureGame();
  unlockSound();
  bus.emit('start', { mode, level: s.selectedLevels[mode], pilot: s.pilot });
  // The scene sets screen 'game' once it has booted; switch now so the view never lags a slow boot.
  store.setState({ screen: 'game' });
  window.scrollTo(0, 0);
  focusSoon();
}

export function goHome(): void {
  closeCheat(false);
  ui.setState({ guideOpen: false });
  bus.emit('home');
  // The scene resets these too; also cover a run that never booted.
  store.setState({ screen: 'menu', session: null, dialog: null, countdown: null, message: null });
  window.scrollTo(0, 0);
}

export function retryRun(): void {
  unlockSound();
  bus.emit('retry');
  focusSoon();
}

export function pauseRun(): void {
  bus.emit('pause');
}

export function resumeRun(): void {
  unlockSound();
  bus.emit('resume');
  focusSoon();
}

/** P / Esc / the pause button. */
export function togglePause(): void {
  if (isPaused()) resumeRun();
  else if (store.getState().session?.phase === 'running') pauseRun();
}

/**
 * The scene sets the pause dialog synchronously when it pauses, while the HUD snapshot (and its phase)
 * only follows on the next frame, so the dialog is the reliable signal.
 */
export function isPaused(): boolean {
  const s = store.getState();
  return s.dialog?.kind === 'pause' || (s.session?.phase === 'paused' && s.dialog === null);
}

export function openGuide(): void { ui.setState({ guideOpen: true }); }
export function closeGuide(): void { ui.setState({ guideOpen: false }); }

/** Backquote during ready/running/paused. */
export function openCheat(): void {
  if (ui.getState().cheatOpen) return;
  const phase = store.getState().session?.phase;
  if (phase !== 'ready' && phase !== 'running' && phase !== 'paused') return;
  const paused = isPaused();
  ui.setState({ cheatOpen: true, cheatResume: !paused, cheatFeedback: null });
  if (!paused && phase === 'running') pauseRun();
}

export function closeCheat(resume = true): void {
  const { cheatOpen, cheatResume } = ui.getState();
  if (!cheatOpen) return;
  ui.setState({ cheatOpen: false, cheatResume: false, cheatFeedback: null });
  if (resume && cheatResume) {
    if (isPaused()) resumeRun();
    else focusSoon();
  }
}

export function submitCheat(code: string): void {
  bus.emit('cheat', { code });
}

// Cheat feedback for the console line.
bus.on('cheat-result', (result) => {
  ui.setState({ cheatFeedback: result.ok ? { text: result.label, ok: true } : { text: result.reason ?? 'Unknown code', ok: false } });
});

// A countdown that ends while the console is open would start the run under it: pause right away.
// Close the console when the run ends, crosses a portal or leaves.
store.subscribe(() => {
  const { cheatOpen, cheatResume } = ui.getState();
  if (!cheatOpen) return;
  const s = store.getState();
  const phase = s.session?.phase;
  if (s.screen !== 'game' || !phase || phase === 'over' || phase === 'crossing') closeCheat(false);
  else if (phase === 'running' && cheatResume && !isPaused()) pauseRun();
});
