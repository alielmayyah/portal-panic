// Live-region text: race toasts plus the phase cues main.js announced (get ready, go, entering...).
import { useEffect, useState } from 'react';
import { store, type AppState } from '../../core/store';

export interface Announcement { text: string; seq: number }

function cue(prev: AppState, next: AppState): string | null {
  const a = prev.session;
  const b = next.session;
  if (next.message && next.message !== prev.message) return next.message.text;
  if (!b) return null;
  if (b.phase === 'ready' && (a?.phase !== 'ready' || a.level !== b.level)) {
    return b.mode === 'versus' ? 'Race starting' : `Level ${b.level + 1}: ${b.levelName}. Get ready`;
  }
  if (b.phase === 'running' && a?.phase === 'ready') return 'Go';
  if (next.countdown?.kind === 'crossing' && prev.countdown?.kind !== 'crossing') return `Entering ${next.countdown.text}`;
  return null;
}

export function useAnnouncer(): Announcement {
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', seq: 0 });
  useEffect(() => {
    let prev = store.getState();
    return store.subscribe(() => {
      const next = store.getState();
      const text = cue(prev, next);
      prev = next;
      if (text) setAnnouncement((a) => ({ text, seq: a.seq + 1 }));
    });
  }, []);
  return announcement;
}
