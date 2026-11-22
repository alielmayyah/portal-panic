import type { CheatCode, CheatResult } from './types';
import { BOOTS_TICKS, MAX_MISSILES, type World } from './world';

export interface CheatInfo { code: CheatCode; description: string }

/** Every cheat code, for a help list in the cheat console. */
export const CHEATS: readonly CheatInfo[] = [
  { code: 'GODMODE', description: 'Toggle invincibility (pits put you back on safe ground)' },
  { code: 'AMMO', description: 'Refill missiles' },
  { code: 'INFINITEAMMO', description: 'Toggle unlimited missiles' },
  { code: 'SHIELD', description: 'Phase shield' },
  { code: 'BOOTS', description: 'Gravity boots' },
  { code: 'SKIP', description: 'Warp through the exit portal (solo)' },
  { code: 'UNLOCKALL', description: 'Unlock every level' },
];

/** Upper-cases and strips whitespace: " god mode " -> "GODMODE". */
export const normalizeCheat = (input: string): string => input.replace(/\s+/g, '').toUpperCase();

export const isCheatCode = (code: string): code is CheatCode => CHEATS.some((cheat) => cheat.code === code);

/**
 * Applies a cheat to every runner in the world. Any cheat except UNLOCKALL sets world.cheatsUsed,
 * so the app must not save the solo best or count the run. UNLOCKALL only returns { unlockAll: true };
 * the app unlocks the levels (store actions.unlockAll()).
 */
export function applyCheat(world: World, input: string): CheatResult {
  const code = normalizeCheat(input);
  if (!isCheatCode(code)) return { ok: false, reason: 'Unknown code' };
  const runners = world.runners;
  let label: string;
  switch (code) {
    case 'UNLOCKALL':
      return { ok: true, code, label: 'All levels unlocked', unlockAll: true };
    case 'GODMODE': {
      const on = !world.runner.god;
      for (const r of runners) r.god = on;
      label = on ? 'God mode on' : 'God mode off';
      break;
    }
    case 'AMMO':
      for (const r of runners) r.missiles = r.maxMissiles ?? MAX_MISSILES;
      label = 'Missiles refilled';
      break;
    case 'INFINITEAMMO': {
      const on = !world.runner.infiniteAmmo;
      for (const r of runners) r.infiniteAmmo = on;
      label = on ? 'Infinite missiles on' : 'Infinite missiles off';
      break;
    }
    case 'SHIELD':
      for (const r of runners) if (r.alive) r.shield = true;
      label = 'Phase shield ready';
      break;
    case 'BOOTS':
      for (const r of runners) if (r.alive) { r.boots = BOOTS_TICKS; r.extraJump = true; }
      label = 'Gravity boots on';
      break;
    case 'SKIP':
      if (world.versus) return { ok: false, reason: 'SKIP works in solo only' };
      if (world.frozen || !world.runner.alive) return { ok: false, reason: 'Not now' };
      world.cheatsUsed = true;
      world.forcePortal(world.runner);
      return { ok: true, code, label: 'Skipping level' };
  }
  world.cheatsUsed = true;
  return { ok: true, code, label };
}
