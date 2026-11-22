// App-level keys. Runner actions (and Tab/scroll-key/Space-release handling during a run) live in the
// Phaser GameScene; this hook only handles P/Esc, M, V, 1/2, the Konami code and Backquote.
// Bubble phase on window: the cheat console and the dialogs stop propagation of the keys they own.
import { useEffect } from 'react';
import { sound, unlockSound } from '../../audio/instance';
import { CHEAT_CONSOLE_KEY, KONAMI } from '../../core/input';
import { actions, store } from '../../core/store';
import { inWindowMode, toggleFullscreen, toggleSound } from './controls';
import { openCheat, startRun, togglePause, ui } from './session';

export function useGlobalKeys(): void {
  useEffect(() => {
    let konami = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      // Shift stays allowed: ShiftRight is a player 2 key and must not block anything here.
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const { guideOpen, cheatOpen } = ui.getState();
      if (guideOpen || cheatOpen) return;
      const state = store.getState();
      const phase = state.session?.phase;
      const dialogOpen = state.dialog !== null;

      if (event.code === 'Escape' && inWindowMode()) {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (event.code === 'KeyV' && !event.repeat && !dialogOpen) {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (event.code === 'KeyM' && !event.repeat) toggleSound();

      if (state.screen === 'menu') {
        // Konami code: ↑ ↑ ↓ ↓ ← → ← → B A unlocks every level.
        if (!event.repeat) {
          konami = event.code === KONAMI[konami] ? konami + 1 : event.code === KONAMI[0] ? 1 : 0;
          if (konami === KONAMI.length) {
            konami = 0;
            actions.unlockAll();
            unlockSound();
            sound.gadget();
            actions.notify('All levels unlocked');
            return;
          }
        }
        if (!event.repeat && (event.code === 'Digit1' || event.code === 'Digit2')) {
          // Do not start from a key typed into a form control.
          if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
          startRun(event.code === 'Digit1' ? 'solo' : 'versus');
        }
        return;
      }
      if (state.screen !== 'game') return;

      if (event.code === CHEAT_CONSOLE_KEY) {
        if (phase === 'ready' || phase === 'running' || phase === 'paused') {
          event.preventDefault();
          if (!event.repeat) openCheat();
        }
        return;
      }
      // Esc inside an open dialog is handled (and stopped) by the dialog itself.
      if (!event.repeat && (event.code === 'KeyP' || event.code === 'Escape') && (phase === 'running' || phase === 'paused')) {
        event.preventDefault();
        togglePause();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
