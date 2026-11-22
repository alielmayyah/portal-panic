// localStorage helpers. Every access is guarded: storage may be disabled, full or missing (tests, private mode).
// Older builds stored some values under 'dusk:' keys; those are read as a fallback and never written.
import { LEVELS } from './levels';
import type { Character, Mode } from './types';

export const KEYS = {
  sound: 'portal:sound',
  best: 'portal:best',
  runs: 'portal:runs',
  unlocked: 'portal:unlocked',
  cleared: 'portal:cleared',
  mode: 'portal:mode',
  pilot: 'portal:pilot',
  soloLevel: 'portal:solo-level',
  versusLevel: 'portal:versus-level',
} as const;

export const LEGACY_KEYS = { sound: 'dusk:sound', best: 'dusk:best', runs: 'dusk:runs' } as const;

const storage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

/** Reads a JSON value; returns `fallback` when missing, null or unreadable. */
export function read<T>(key: string, fallback: T): T {
  try {
    const raw = storage()?.getItem(key);
    if (raw == null) return fallback;
    return (JSON.parse(raw) as T) ?? fallback;
  } catch { return fallback; }
}

/** Reads `key`, falling back to `legacyKey`, then `fallback`. */
export const readLegacy = <T>(key: string, legacyKey: string, fallback: T): T => read(key, read(legacyKey, fallback));

export function write(key: string, value: unknown): void {
  try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* storage may be disabled */ }
}

/** Non-negative integer, 0 for anything invalid. */
export function count(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A valid level index. */
export const clampLevel = (value: unknown): number => Math.min(LEVELS.length - 1, Math.max(0, Math.floor(Number(value) || 0)));

export interface Records {
  best: number;
  runs: number;
  /** Highest unlocked solo level index. */
  unlocked: number;
  /** Number of solo levels cleared (0..LEVELS.length). */
  cleared: number;
  mode: Mode;
  pilot: Character;
  selectedLevels: Record<Mode, number>;
  soundEnabled: boolean;
}

/** Everything the garage needs at startup, validated. */
export function loadRecords(): Records {
  const unlocked = clampLevel(read(KEYS.unlocked, 0));
  return {
    best: count(readLegacy(KEYS.best, LEGACY_KEYS.best, 0)),
    runs: count(readLegacy(KEYS.runs, LEGACY_KEYS.runs, 0)),
    unlocked,
    cleared: Math.min(LEVELS.length, Math.max(unlocked, count(read(KEYS.cleared, 0)))),
    mode: read<unknown>(KEYS.mode, 'solo') === 'versus' ? 'versus' : 'solo',
    pilot: read<unknown>(KEYS.pilot, 'rick') === 'morty' ? 'morty' : 'rick',
    selectedLevels: {
      solo: Math.min(unlocked, clampLevel(read(KEYS.soloLevel, unlocked))),
      versus: clampLevel(read(KEYS.versusLevel, 0)),
    },
    soundEnabled: readLegacy<unknown>(KEYS.sound, LEGACY_KEYS.sound, true) !== false,
  };
}
