import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOSS_EVENT_SOUNDS, BOSS_FADE, HURT_GAP, STING_HOLD, syncBossAudio } from '../src/audio/boss';
import { EFFECTS, Sound } from '../src/audio/sound';

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

function node() {
  return { connect: vi.fn((next: unknown) => next), gain: param(), frequency: param() };
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 1;
  sampleRate = 8000;
  destination = {};
  gains: ReturnType<typeof node>[] = [];
  createGain = vi.fn(() => { const n = node(); this.gains.push(n); return n; });
  createOscillator = vi.fn(() => ({ ...node(), type: 'sine', start: vi.fn(), stop: vi.fn() }));
  createBufferSource = vi.fn(() => ({ ...node(), buffer: null, start: vi.fn() }));
  createBiquadFilter = vi.fn(() => ({ ...node(), type: 'lowpass' }));
  createBuffer = vi.fn((_c: number, length: number) => {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  });
  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  constructor() { MockAudioContext.instances.push(this); }
}

const g = globalThis as Record<string, unknown>;
const track = { bass: [36, 43, 39, 46], beat: 0.25 };
const BOSS_EFFECTS = ['bossIntro', 'bossPhase', 'bossCharge', 'bossVolley', 'bossSummon', 'bossHurt', 'bossDeath', 'portalOpen'] as const;

function setup() {
  g.AudioContext = MockAudioContext;
  const sound = new Sound();
  sound.unlock();
  const ctx = MockAudioContext.instances[0]!;
  // createGain order in unlock(): master, music, levelBus, bossBus.
  const [, , levelBus, bossBus] = ctx.gains;
  return { sound, ctx, levelBus: levelBus!, bossBus: bossBus! };
}

const lastTarget = (n: ReturnType<typeof node>) => n.gain.setTargetAtTime.mock.calls.at(-1);

afterEach(() => {
  delete g.AudioContext;
  delete g.webkitAudioContext;
  MockAudioContext.instances = [];
  vi.useRealTimers();
});

describe('boss audio without AudioContext', () => {
  it('never throws', () => {
    const sound = new Sound();
    expect(() => {
      sound.unlock();
      sound.playMusic(true);
      sound.setBossMusic({ active: true, phase: 3, hpRatio: 0.1 });
      sound.updateMusic(track);
      for (const name of BOSS_EFFECTS) sound.play(name);
      sound.bossVictory();
      sound.setBossMusic({ active: false, defeated: true });
      syncBossAudio(sound, { boss: { hp: 1, maxHp: 30, phase: 3, awake: true, defeated: false, active: true } });
      syncBossAudio(sound, null);
      sound.playMusic(false);
    }).not.toThrow();
    expect(sound.ctx).toBeNull();
    expect(sound.bossMusic.active).toBe(false);
  });

  it('ignores garbage state', () => {
    const sound = new Sound();
    expect(() => {
      sound.setBossMusic(null as never);
      sound.setBossMusic({ active: true, phase: NaN, hpRatio: Infinity });
    }).not.toThrow();
    expect(sound.bossMusic.phase).toBe(1);
  });
});

describe('boss audio when disabled', () => {
  it('creates no context and plays nothing', () => {
    g.AudioContext = MockAudioContext;
    const sound = new Sound(false);
    sound.unlock();
    sound.playMusic(true);
    sound.setBossMusic({ active: true, phase: 2, hpRatio: 0.5 });
    sound.updateMusic(track);
    for (const name of BOSS_EFFECTS) sound[name]();
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('stops scheduling boss beats after mute and after playMusic(false)', () => {
    vi.useFakeTimers();
    const { sound, ctx } = setup();
    sound.playMusic(true);
    sound.setBossMusic({ active: true, phase: 3, hpRatio: 0.1 });
    sound.setEnabled(false);
    ctx.createOscillator.mockClear();
    ctx.currentTime = 5;
    sound.updateMusic(track);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    sound.setEnabled(true);
    sound.playMusic(false);
    ctx.currentTime = 6;
    sound.updateMusic(track);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('boss music crossfade', () => {
  it('fades level -> boss -> level with the victory sting hold', () => {
    const { sound, ctx, levelBus, bossBus } = setup();
    expect(levelBus.gain.value).toBe(1);
    expect(bossBus.gain.value).toBe(0);
    expect(sound.bossMusic.mix).toBe('level');

    sound.setBossMusic({ active: true, phase: 1, hpRatio: 1 });
    expect(lastTarget(bossBus)?.slice(0, 2)).toEqual([1, 1]);
    expect(lastTarget(levelBus)?.slice(0, 2)).toEqual([0, 1]);
    expect(sound.bossMusic.mix).toBe('to-boss');
    ctx.currentTime = 1 + BOSS_FADE + 0.01;
    expect(sound.bossMusic.mix).toBe('boss');

    // Phase / low-hp changes do not crossfade again.
    bossBus.gain.setTargetAtTime.mockClear();
    sound.setBossMusic({ active: true, phase: 3, hpRatio: 0.2 });
    expect(bossBus.gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(sound.bossMusic).toMatchObject({ phase: 3, low: true, mix: 'boss' });

    const victory = vi.spyOn(sound, 'bossVictory');
    const t = ctx.currentTime;
    sound.setBossMusic({ active: false, defeated: true });
    expect(victory).toHaveBeenCalledTimes(1);
    expect(lastTarget(bossBus)?.slice(0, 2)).toEqual([0, t]);
    expect(lastTarget(levelBus)?.slice(0, 2)).toEqual([1, t + STING_HOLD]);
    expect(sound.bossMusic.mix).toBe('sting');
    ctx.currentTime = t + STING_HOLD + 0.1;
    expect(sound.bossMusic.mix).toBe('to-level');
    ctx.currentTime = t + STING_HOLD + BOSS_FADE + 0.1;
    expect(sound.bossMusic.mix).toBe('level');
  });

  it('returns without a sting when the boss is left undefeated', () => {
    const { sound, ctx, levelBus } = setup();
    sound.setBossMusic({ active: true, phase: 1 });
    const victory = vi.spyOn(sound, 'bossVictory');
    sound.setBossMusic({ active: false });
    expect(victory).not.toHaveBeenCalled();
    expect(lastTarget(levelBus)?.slice(0, 2)).toEqual([1, ctx.currentTime]);
  });

  it('routes the boss sequencer to the boss bus and pauses the level sequencer', () => {
    const { sound, ctx, levelBus, bossBus } = setup();
    sound.playMusic(true);
    sound.updateMusic(track);
    const outputs = () => ctx.createGain.mock.results.slice(4).map((r) => r.value as ReturnType<typeof node>)
      .flatMap((gain) => gain.connect.mock.calls.map((c) => c[0]));
    expect(outputs()).toContain(levelBus);
    expect(outputs()).not.toContain(bossBus);

    sound.setBossMusic({ active: true, phase: 2, hpRatio: 0.1 });
    ctx.currentTime = 1 + BOSS_FADE + 1;
    ctx.createGain.mockClear();
    sound.updateMusic(track);
    const after = ctx.createGain.mock.results.map((r) => r.value as ReturnType<typeof node>)
      .flatMap((gain) => gain.connect.mock.calls.map((c) => c[0]));
    expect(after).toContain(bossBus);
    expect(after).not.toContain(levelBus);
  });
});

describe('boss effects', () => {
  it('are all in the EffectName union and make sound', () => {
    const { sound, ctx } = setup();
    for (const name of BOSS_EFFECTS) {
      expect(EFFECTS).toContain(name);
      ctx.createOscillator.mockClear();
      sound.play(name);
      expect(ctx.createOscillator.mock.calls.length, name).toBeGreaterThan(0);
    }
  });

  it('rate-limits bossHurt and varies its pitch', () => {
    const { sound, ctx } = setup();
    const freqs: number[] = [];
    ctx.createOscillator.mockImplementation(() => {
      const o = { ...node(), type: 'sine', start: vi.fn(), stop: vi.fn() };
      o.frequency.setValueAtTime.mockImplementation((f: number) => { freqs.push(f); });
      return o;
    });
    ctx.currentTime = 10;
    sound.bossHurt();
    const first = ctx.createOscillator.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    ctx.currentTime = 10 + HURT_GAP / 2;
    sound.bossHurt();
    expect(ctx.createOscillator.mock.calls.length).toBe(first);
    const pitches = new Set<number>([freqs[0]!]);
    for (let i = 1; i <= 8; i++) {
      ctx.currentTime = 10 + i * (HURT_GAP + 0.01);
      freqs.length = 0;
      sound.bossHurt();
      pitches.add(freqs[0]!);
    }
    expect(ctx.createOscillator.mock.calls.length).toBe(first * 9);
    expect(pitches.size).toBeGreaterThan(1);
  });
});

describe('BOSS_EVENT_SOUNDS', () => {
  it('maps the enemies.ts boss events to effects', () => {
    expect(BOSS_EVENT_SOUNDS).toEqual({
      'boss-intro': 'bossIntro', 'boss-phase': 'bossPhase', 'boss-charge': 'bossCharge', 'boss-volley': 'bossVolley',
      'boss-summon': 'bossSummon', 'boss-hurt': 'bossHurt', 'boss-death': 'bossDeath', 'portal-open': 'portalOpen',
    });
    for (const effect of Object.values(BOSS_EVENT_SOUNDS)) expect(EFFECTS).toContain(effect);
  });
});

describe('syncBossAudio', () => {
  const boss = (o: Partial<{ hp: number; phase: number; awake: boolean; defeated: boolean; active: boolean }> = {}) => ({
    boss: { name: 'X', hp: 30, maxHp: 30, phase: 1, awake: true, defeated: false, active: true, x: 0, ...o },
  });

  it('calls setBossMusic only on change and the victory sting once', () => {
    const sound = { setBossMusic: vi.fn() };
    syncBossAudio(sound, { boss: null });
    expect(sound.setBossMusic).toHaveBeenLastCalledWith(expect.objectContaining({ active: false }));
    syncBossAudio(sound, { boss: null });
    syncBossAudio(sound, boss({ awake: false, active: false }));
    expect(sound.setBossMusic).toHaveBeenCalledTimes(1);

    syncBossAudio(sound, boss());
    syncBossAudio(sound, boss({ hp: 25 }));
    expect(sound.setBossMusic).toHaveBeenCalledTimes(2);
    expect(sound.setBossMusic).toHaveBeenLastCalledWith(expect.objectContaining({ active: true, phase: 1 }));

    syncBossAudio(sound, boss({ hp: 15, phase: 2 }));
    syncBossAudio(sound, boss({ hp: 6, phase: 3 }));
    syncBossAudio(sound, boss({ hp: 5, phase: 3 }));
    expect(sound.setBossMusic).toHaveBeenCalledTimes(4);
    expect(sound.setBossMusic).toHaveBeenLastCalledWith(expect.objectContaining({ active: true, phase: 3, hpRatio: 0.2 }));

    syncBossAudio(sound, boss({ hp: 0, phase: 3, defeated: true, active: false }));
    syncBossAudio(sound, boss({ hp: 0, phase: 3, defeated: true, active: false }));
    expect(sound.setBossMusic).toHaveBeenCalledTimes(5);
    expect(sound.setBossMusic).toHaveBeenLastCalledWith(expect.objectContaining({ active: false, defeated: true }));

    syncBossAudio(sound, null);
    expect(sound.setBossMusic).toHaveBeenCalledTimes(6);
    expect(sound.setBossMusic).toHaveBeenLastCalledWith(expect.objectContaining({ active: false, defeated: false }));
  });

  it('fires the victory sting exactly once on a real Sound', () => {
    const { sound } = setup();
    const victory = vi.spyOn(sound, 'bossVictory');
    syncBossAudio(sound, boss());
    syncBossAudio(sound, boss({ hp: 0, defeated: true, active: false }));
    syncBossAudio(sound, boss({ hp: 0, defeated: true, active: false }));
    syncBossAudio(sound, null);
    expect(victory).toHaveBeenCalledTimes(1);
  });

  it('never throws on a throwing sound', () => {
    const sound = { setBossMusic: vi.fn(() => { throw new Error('x'); }) };
    expect(() => syncBossAudio(sound, boss())).not.toThrow();
  });
});
