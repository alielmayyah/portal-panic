import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_SCHEMES, SOLO_KEYS, VERSUS_KEYS, keyMapFor, keyName, keyNames, refineKeyNames } from '../src/core/input';

describe('versus key map', () => {
  it('gives Morty arrows, Right Shift to fire and Backslash to fire a missile', () => {
    expect(VERSUS_KEYS.ArrowLeft).toEqual([1, 'left']);
    expect(VERSUS_KEYS.ArrowRight).toEqual([1, 'right']);
    expect(VERSUS_KEYS.ArrowUp).toEqual([1, 'jump']);
    expect(VERSUS_KEYS.ArrowDown).toEqual([1, 'duck']);
    expect(VERSUS_KEYS.ShiftRight).toEqual([1, 'fire']);
    expect(VERSUS_KEYS.Backslash).toEqual([1, 'missile']);
    expect(VERSUS_KEYS.IntlBackslash).toBeUndefined();
  });

  it('no longer binds Enter or Slash, and leaves Left Shift free', () => {
    for (const code of ['Enter', 'NumpadEnter', 'Slash', 'NumpadDivide', 'ShiftLeft']) expect(VERSUS_KEYS[code]).toBeUndefined();
  });

  it('keeps Rick on WASD + F/G and solo unchanged', () => {
    expect(VERSUS_KEYS.KeyF).toEqual([0, 'fire']);
    expect(VERSUS_KEYS.KeyG).toEqual([0, 'missile']);
    expect(keyMapFor('solo')).toBe(SOLO_KEYS);
    expect(keyMapFor('versus')).toBe(VERSUS_KEYS);
    expect(SOLO_KEYS.ShiftRight).toBeUndefined();
  });

  it('every key shown in a control scheme is actually bound for that runner', () => {
    for (const mode of ['solo', 'versus'] as const) {
      CONTROL_SCHEMES[mode].forEach((scheme, runner) => {
        for (const codes of scheme.keys) for (const code of codes) expect(keyMapFor(mode)[code]?.[0]).toBe(runner);
      });
    }
  });

  it('shows Morty as Shift and \\ in the guide', () => {
    const morty = CONTROL_SCHEMES.versus[1]!;
    const labels = morty.keys.map((codes) => codes.map(keyName).join('/'));
    expect(labels).toEqual(['←/→', '↑', '↓', 'Shift', '\\', 'Right Ctrl']);
  });
});

describe('refineKeyNames', () => {
  const saved = { ...keyNames };
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(keyNames)) delete keyNames[k];
    Object.assign(keyNames, saved);
  });

  it('relabels Backslash and IntlBackslash from the layout map', async () => {
    const map = new Map([['Backslash', '#'], ['IntlBackslash', '<'], ['KeyA', 'q']]);
    vi.stubGlobal('navigator', { keyboard: { getLayoutMap: async () => map } });
    expect(await refineKeyNames()).toBe(true);
    expect(keyName('Backslash')).toBe('#');
    expect(keyName('IntlBackslash')).toBe('<');
    expect(keyName('KeyA')).toBe('Q');
    expect(keyName('ShiftRight')).toBe('Shift');
  });
});
