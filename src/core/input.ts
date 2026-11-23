// Key maps, control schemes and held-input bookkeeping. Bindings are physical key positions (KeyboardEvent.code);
// labels follow the player's layout when the browser exposes it (refineKeyNames).
import type { Action, Mode, Runner } from './types';
import { ACTIONS } from './world';

/** [runner index, action] */
export type KeyBinding = readonly [runner: number, action: Action];
export type KeyMap = Readonly<Record<string, KeyBinding>>;

export const SOLO_KEYS: KeyMap = {
  KeyA: [0, 'left'], ArrowLeft: [0, 'left'], KeyD: [0, 'right'], ArrowRight: [0, 'right'],
  Space: [0, 'jump'], ArrowUp: [0, 'jump'], KeyW: [0, 'jump'], ArrowDown: [0, 'duck'], KeyS: [0, 'duck'],
  KeyF: [0, 'fire'], KeyG: [0, 'missile'], KeyQ: [0, 'swap'],
};
export const VERSUS_KEYS: KeyMap = {
  KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], KeyS: [0, 'duck'], KeyF: [0, 'fire'], KeyG: [0, 'missile'],
  ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'jump'], ArrowDown: [1, 'duck'],
  // Right Shift via event.code only (ShiftLeft stays free). IntlBackslash (the ISO key beside left Shift)
  // is deliberately unbound: it sits under Rick's hand, so Rick could spend Morty's missiles.
  ShiftRight: [1, 'fire'], Backslash: [1, 'missile'],
  // Weapon swap (weapons.ts): Q for Rick, Right Ctrl for Morty.
  KeyQ: [0, 'swap'], ControlRight: [1, 'swap'],
};
export const keyMapFor = (mode: Mode): KeyMap => (mode === 'versus' ? VERSUS_KEYS : SOLO_KEYS);

/** Keys whose default (page scroll) is prevented during a run. */
export const SCROLL_KEYS: readonly string[] = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];

/** Konami code (KeyboardEvent.code values); on the menu it unlocks all levels. */
export const KONAMI: readonly string[] = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

/** Opens the cheat console during a run. */
export const CHEAT_CONSOLE_KEY = 'Backquote';

export interface ControlScheme {
  /** Group title (shown only when a scheme has more than one group). */
  label: string;
  /** One entry per CONTROL_LABELS row: the key codes for that control. */
  keys: readonly (readonly string[])[];
}

export const CONTROL_SCHEMES: Readonly<Record<Mode, readonly ControlScheme[]>> = {
  solo: [{ label: 'Solo', keys: [['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'], ['Space', 'ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS'], ['KeyF'], ['KeyG'], ['KeyQ']] }],
  versus: [
    { label: 'Rick', keys: [['KeyA', 'KeyD'], ['KeyW'], ['KeyS'], ['KeyF'], ['KeyG'], ['KeyQ']] },
    { label: 'Morty', keys: [['ArrowLeft', 'ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['ShiftRight'], ['Backslash'], ['ControlRight']] },
  ],
};
export const CONTROL_LABELS: readonly string[] = ['Move', 'Jump', 'Duck', 'Blaster', 'Missile', 'Swap weapon'];

/** Display names for key codes. Mutable: refineKeyNames() replaces letters with the player's layout. */
export const keyNames: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', ShiftRight: 'Shift', Backslash: '\\', IntlBackslash: '\\', ControlRight: 'Right Ctrl' };
export const keyName = (code: string): string => keyNames[code] ?? code.replace(/^Key/, '');

interface KeyboardLayoutMapLike { get(code: string): string | undefined }
interface NavigatorKeyboardLike { getLayoutMap?: () => Promise<KeyboardLayoutMapLike> }

/**
 * Updates keyNames from navigator.keyboard.getLayoutMap() when available (e.g. AZERTY shows Q instead of A).
 * Resolves true when labels changed, so the UI can re-render its legends. Never rejects.
 */
export async function refineKeyNames(): Promise<boolean> {
  try {
    const keyboard = (globalThis.navigator as (Navigator & { keyboard?: NavigatorKeyboardLike }) | undefined)?.keyboard;
    const map = await keyboard?.getLayoutMap?.();
    if (!map) return false;
    let changed = false;
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'KeyQ', 'Backslash', 'IntlBackslash']) {
      const key = map.get(code);
      if (key && /^[\x21-\x7e]$/.test(key)) {
        const label = key.toUpperCase();
        if (keyName(code) !== label) changed = true;
        keyNames[code] = label;
      }
    }
    return changed;
  } catch { return false; }
}

/**
 * Held and tapped input for each runner, shared by keyboard and touch. A source is a key code or pointer id.
 * Port of the old main.js press/held logic: a tap counts even if released before the next step;
 * missile only fires on a tap (never while held).
 */
export class ControlState {
  readonly held: Set<string | number>[][];
  readonly pressed: Set<Action>[];

  constructor(runnerCount: number) {
    this.held = Array.from({ length: runnerCount }, () => ACTIONS.map(() => new Set<string | number>()));
    this.pressed = Array.from({ length: runnerCount }, () => new Set<Action>());
  }

  /** `running`: taps before GO only count while held, so an early missile tap cannot fire at the start. */
  press(runner: number, action: Action, source: string | number, running: boolean): void {
    const held = this.held[runner]?.[ACTIONS.indexOf(action)];
    if (!held) return;
    if (!held.size && running) this.pressed[runner]!.add(action);
    held.add(source);
  }

  release(runner: number, action: Action, source: string | number): void {
    this.held[runner]?.[ACTIONS.indexOf(action)]?.delete(source);
  }

  /** Keyboard auto-repeat re-arms a direction or blaster still held after pause, blur or a level change. */
  repeat(runner: number, action: Action, source: string | number): void {
    if (action === 'jump' || action === 'missile') return;
    this.held[runner]?.[ACTIONS.indexOf(action)]?.add(source);
  }

  /** A one-shot tap (e.g. a keyboard-activated touch button). */
  tap(runner: number, action: Action): void { this.pressed[runner]?.add(action); }

  isHeld(runner: number, action: Action): boolean { return (this.held[runner]?.[ACTIONS.indexOf(action)]?.size ?? 0) > 0; }

  clear(): void {
    for (const p of this.pressed) p.clear();
    for (const actions of this.held) for (const set of actions) set.clear();
  }

  /** Between levels: keep held directions so the runner moves at GO; drop taps and a held jump. */
  clearForCrossing(): void {
    for (const p of this.pressed) p.clear();
    for (const actions of this.held) actions[ACTIONS.indexOf('jump')]!.clear();
  }

  /** Writes runner.input for one fixed step and consumes taps. Call right before world.step(). */
  apply(runners: readonly Runner[]): void {
    runners.forEach((runner, index) => {
      const pressed = this.pressed[index];
      const held = this.held[index];
      if (!pressed || !held) return;
      ACTIONS.forEach((action, slot) => {
        runner.input[action] = pressed.has(action) || (action !== 'missile' && held[slot]!.size > 0);
      });
      pressed.clear();
    });
  }
}
