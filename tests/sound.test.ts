import { afterEach, describe, expect, it, vi } from 'vitest';
import { EFFECTS, Sound } from '../src/audio/sound';

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

function node() {
  const n = { connect: vi.fn((next: unknown) => next), gain: param(), frequency: param() };
  return n;
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 1;
  sampleRate = 8000;
  destination = {};
  createGain = vi.fn(() => node());
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

function callEverything(sound: Sound) {
  sound.unlock();
  sound.click();
  sound.tick();
  sound.go();
  sound.playMusic(true);
  sound.updateMusic(track);
  sound.updateMusic(undefined);
  sound.playMusic(false);
  for (const name of EFFECTS) sound[name]();
  for (const name of EFFECTS) sound.play(name);
  sound.play('not-an-effect');
}

afterEach(() => {
  delete g.AudioContext;
  delete g.webkitAudioContext;
  MockAudioContext.instances = [];
  vi.useRealTimers();
});

describe('Sound without AudioContext', () => {
  it('constructs and runs every method without throwing', () => {
    expect(g.AudioContext).toBeUndefined();
    const sound = new Sound();
    expect(sound.enabled).toBe(true);
    expect(sound.ctx).toBeNull();
    expect(() => callEverything(sound)).not.toThrow();
    expect(() => { sound.setEnabled(false); sound.setEnabled(true); }).not.toThrow();
    expect(sound.ctx).toBeNull();
  });

  it('survives a constructor that throws (blocked audio)', () => {
    g.AudioContext = class { constructor() { throw new Error('blocked'); } };
    const sound = new Sound();
    expect(() => callEverything(sound)).not.toThrow();
    expect(sound.ctx).toBeNull();
  });

  it('falls back to webkitAudioContext', () => {
    g.webkitAudioContext = MockAudioContext;
    const sound = new Sound();
    sound.unlock();
    expect(sound.ctx).toBeInstanceOf(MockAudioContext);
  });
});

describe('Sound when disabled', () => {
  it('never creates a context and every method is a no-op', () => {
    g.AudioContext = MockAudioContext;
    const sound = new Sound(false);
    expect(() => callEverything(sound)).not.toThrow();
    expect(MockAudioContext.instances).toHaveLength(0);
    expect(sound.ctx).toBeNull();
  });

  it('stops producing sound after setEnabled(false)', () => {
    vi.useFakeTimers();
    g.AudioContext = MockAudioContext;
    const sound = new Sound(true);
    sound.unlock();
    const ctx = MockAudioContext.instances[0]!;
    sound.setEnabled(false);
    ctx.createOscillator.mockClear();
    ctx.createBufferSource.mockClear();
    callEverything(sound);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(ctx.suspend).toHaveBeenCalled();
  });
});

describe('Sound when enabled', () => {
  it('plays effects and music through the context', () => {
    g.AudioContext = MockAudioContext;
    const sound = new Sound();
    sound.unlock();
    const ctx = MockAudioContext.instances[0]!;
    for (const name of EFFECTS) {
      ctx.createOscillator.mockClear();
      ctx.createBufferSource.mockClear();
      sound[name]();
      const made = ctx.createOscillator.mock.calls.length + ctx.createBufferSource.mock.calls.length;
      expect(made, name).toBeGreaterThan(0);
    }
    ctx.createOscillator.mockClear();
    sound.playMusic(true);
    sound.updateMusic(track);
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('swallows errors from a broken context', () => {
    g.AudioContext = MockAudioContext;
    const sound = new Sound();
    sound.unlock();
    const ctx = MockAudioContext.instances[0]!;
    ctx.createOscillator.mockImplementation(() => { throw new Error('closed'); });
    ctx.createBufferSource.mockImplementation(() => { throw new Error('closed'); });
    expect(() => callEverything(sound)).not.toThrow();
  });
});
