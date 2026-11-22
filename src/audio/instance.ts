// The one shared Sound instance: the Phaser scene plays game effects through it and the UI uses it for
// clicks and mute, so muting in one place silences both.
import { KEYS, LEGACY_KEYS, readLegacy } from '../core/storage';
import { Sound } from './sound';

export const sound = new Sound(readLegacy<unknown>(KEYS.sound, LEGACY_KEYS.sound, true) !== false);

/** Audio is optional: a browser that refuses an AudioContext must never stop the game. */
export function unlockSound(): void {
  try { sound.unlock(); } catch { /* play silently */ }
}
