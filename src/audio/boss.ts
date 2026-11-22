// Boss fight audio: a procedural boss track that crossfades with the level track, and the boss effects.
// Nothing here uses timers: fades are AudioParam automation and the sequencer is driven by
// Sound.updateMusic() once per frame, so muting or playMusic(false) stops it on the next frame.
//
// GameScene hooks (see the report / README of the port):
//   EVENT_SOUNDS: { ...BOSS_EVENT_SOUNDS }       world events -> effect names
//   once per frame: syncBossAudio(sound, s.world) drives sound.setBossMusic() (changes only on change)
//   when the session ends: syncBossAudio(sound, null)
import type { WorldEventType } from '../core/types';
import type { EffectName, Sound } from './sound';

/** What the boss track needs to know. hpRatio = boss hp / max hp (below 0.25 adds a heartbeat). */
export interface BossMusicState {
  active: boolean;
  phase?: number;
  hpRatio?: number;
  /** The boss just died: play the victory sting before the level track returns. */
  defeated?: boolean;
}

/** Where the mix is: settled on a track, crossfading, or holding for the victory sting. */
export type BossMix = 'level' | 'to-boss' | 'boss' | 'sting' | 'to-level';

export interface BossMusicSnapshot {
  active: boolean;
  phase: number;
  low: boolean;
  mix: BossMix;
}

/** The parts of Sound the boss track plays through (structural, so tests can pass a stub). */
export type BossMusicHost = Pick<Sound, 'tone' | 'noise' | 'bossVictory'>;

/** Crossfade length in seconds. */
export const BOSS_FADE = 0.6;
/** How long the level track waits after a boss death so the victory sting plays alone. */
export const STING_HOLD = 1.6;
/** Minimum audio-time gap between two bossHurt clangs. */
export const HURT_GAP = 0.085;
export const LOW_HP = 0.25;

const TAU = BOSS_FADE / 4;
/** Step length per phase (phase 2 and 3 bump the tempo). */
const STEP = [0.17, 0.17, 0.15, 0.13] as const;
/** A minor ostinato: A1 A1 A2 A1 C2 A1 G#2 E2. */
const BASS = [33, 33, 45, 33, 36, 33, 44, 40] as const;
/** Am, F, G, E arpeggio chords for the phase 2+ lead. */
const CHORDS = [[69, 72, 76], [65, 69, 72], [67, 71, 74], [64, 68, 71]] as const;

const frequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);

function ramp(bus: GainNode | null, value: number, at: number): void {
  if (!bus) return;
  try {
    const p = bus.gain;
    if (typeof p.cancelScheduledValues === 'function') p.cancelScheduledValues(at);
    p.setTargetAtTime(value, at, TAU);
  } catch { /* ignore */ }
}

export class BossMusic {
  active = false;
  phase = 1;
  low = false;
  private ctx: AudioContext | null = null;
  private levelBus: GainNode | null = null;
  private bossBus: GainNode | null = null;
  /** Audio time of the last active switch. */
  private switchedAt = -Infinity;
  /** Audio time the level track starts fading back in (Infinity while the boss track plays). */
  private levelAt = -Infinity;
  private beat = 0;
  private nextBeat = 0;

  constructor(private readonly host: BossMusicHost) {}

  /** Called by Sound.unlock() once the buses exist; applies the current state without a fade. */
  attach(ctx: AudioContext, levelBus: GainNode, bossBus: GainNode): void {
    this.ctx = ctx;
    this.levelBus = levelBus;
    this.bossBus = bossBus;
    this.switchedAt = -Infinity;
    this.levelAt = this.active ? Infinity : -Infinity;
    try {
      levelBus.gain.value = this.active ? 0 : 1;
      bossBus.gain.value = this.active ? 1 : 0;
    } catch { /* ignore */ }
  }

  detach(): void {
    this.ctx = this.levelBus = this.bossBus = null;
  }

  /** Update the target state. Returns true when something changed. Never throws. */
  set(next: BossMusicState): boolean {
    const active = Boolean(next?.active);
    const raw = Number(next?.phase);
    const phase = active && Number.isFinite(raw) ? Math.min(3, Math.max(1, Math.round(raw))) : 1;
    const ratio = Number(next?.hpRatio);
    const low = active && Number.isFinite(ratio) && ratio < LOW_HP;
    if (active === this.active && phase === this.phase && low === this.low) return false;
    const was = this.active;
    this.active = active;
    this.phase = phase;
    this.low = low;
    if (active !== was) this.crossfade(active, !active && Boolean(next?.defeated));
    return true;
  }

  private crossfade(toBoss: boolean, victory: boolean): void {
    const t = this.ctx?.currentTime ?? 0;
    this.switchedAt = t;
    this.levelAt = toBoss ? Infinity : t + (victory ? STING_HOLD : 0);
    if (toBoss) {
      this.beat = 0;
      this.nextBeat = 0;
    }
    if (victory) {
      try { this.host.bossVictory(); } catch { /* ignore */ }
    }
    ramp(this.bossBus, toBoss ? 1 : 0, t);
    ramp(this.levelBus, toBoss ? 0 : 1, toBoss ? t : this.levelAt);
  }

  /** Whether the level sequencer should keep scheduling notes at audio time t. */
  levelAudible(t: number): boolean {
    return this.active ? t < this.switchedAt + BOSS_FADE : t >= this.levelAt - 0.1;
  }

  /** Whether the boss sequencer should keep scheduling notes at audio time t. */
  bossAudible(t: number): boolean {
    return this.active || t < this.switchedAt + BOSS_FADE;
  }

  mixAt(t: number): BossMix {
    if (this.active) return t < this.switchedAt + BOSS_FADE ? 'to-boss' : 'boss';
    if (t < this.levelAt) return 'sting';
    return t < this.levelAt + BOSS_FADE ? 'to-level' : 'level';
  }

  get state(): BossMusicSnapshot {
    return { active: this.active, phase: this.phase, low: this.low, mix: this.mixAt(this.ctx?.currentTime ?? Infinity) };
  }

  /** Restart the pattern from the top (playMusic(true)). */
  resetSequencer(): void {
    this.beat = 0;
    this.nextBeat = 0;
  }

  /** Schedule upcoming boss beats. Sound.updateMusic() calls this only while music plays and sound is on. */
  update(t: number): void {
    if (!this.bossAudible(t)) return;
    const len = STEP[this.phase] ?? STEP[1];
    if (this.nextBeat < t - 0.1) this.nextBeat = t;
    while (this.nextBeat < t + 0.08) {
      this.step(this.beat++, Math.max(0, this.nextBeat - t), len);
      this.nextBeat += len;
    }
  }

  private step(i: number, delay: number, len: number): void {
    const { host, phase } = this;
    const o = { music: true, bus: 'boss' as const, delay };
    // Driving bass ostinato.
    host.tone(frequency(BASS[i % BASS.length]!), len * 0.85, { ...o, type: 'sawtooth', vol: 0.075 });
    // Kick on the beat (plus a pickup from phase 2), snare on the backbeat.
    if (i % 4 === 0 || (phase >= 2 && i % 8 === 7)) host.tone(95, 0.12, { ...o, type: 'sine', slide: -55, vol: 0.26 });
    if (i % 8 === 4) {
      host.noise(0.14, 0.12, { ...o, filter: 1900 });
      host.tone(190, 0.07, { ...o, type: 'triangle', slide: -60, vol: 0.05 });
    }
    // Hats on the offbeats; double time in phase 3.
    if (phase >= 3 || i % 2 === 1) host.noise(0.035, 0.04, { ...o, filter: 7200 });
    // Arpeggiated lead from phase 2.
    if (phase >= 2) {
      const chord = CHORDS[Math.floor(i / 16) % CHORDS.length]!;
      const note = chord[i % 3]! + (i % 6 >= 3 ? 12 : 0);
      host.tone(frequency(note), len * 0.7, { ...o, type: 'square', vol: 0.028 });
    }
    // Tension drone that rises with each phase.
    if (i % 16 === 0) {
      const f = frequency(57 + (phase - 1) * 3);
      host.tone(f, len * 16, { ...o, type: 'triangle', slide: f * 0.04, vol: 0.02 + phase * 0.01 });
    }
    // Siren pad in phase 3: up for 8 steps, down for 8.
    if (phase >= 3 && i % 8 === 0) {
      const f = frequency(76);
      const up = i % 16 === 0;
      host.tone(up ? f : f * 1.5, len * 8, { ...o, type: 'sawtooth', slide: up ? f * 0.5 : -f * 0.5, vol: 0.018 });
    }
    // Heartbeat (lub-dub) while the boss is nearly dead.
    if (this.low && i % 8 === 0) {
      host.tone(58, 0.14, { ...o, type: 'sine', slide: -18, vol: 0.3 });
      host.tone(52, 0.12, { ...o, type: 'sine', slide: -14, vol: 0.22, delay: delay + 0.17 });
    }
  }
}

// ---------- Effects (Sound methods delegate here) ----------

const lastHurt = new WeakMap<object, number>();

/** One-shot boss effects. Each takes the Sound to play through. */
export const bossSfx = {
  /** A deep roar with a rising sweep. */
  bossIntro(s: Sound): void {
    s.noise(1.2, 0.3, { filter: 260, sweepTo: 80 });
    s.tone(70, 1.1, { type: 'sawtooth', slide: -30, vol: 0.12 });
    s.tone(73.5, 1.1, { type: 'sawtooth', slide: -32, vol: 0.1 });
    s.tone(200, 0.9, { type: 'sine', slide: 1400, vol: 0.05, delay: 0.3 });
  },
  /** An alarm and a sub drop. */
  bossPhase(s: Sound): void {
    for (let i = 0; i < 4; i++) s.tone(i % 2 ? 660 : 880, 0.12, { type: 'square', vol: 0.05, delay: i * 0.13 });
    s.tone(120, 0.7, { type: 'sine', slide: -80, vol: 0.26, delay: 0.42 });
    s.noise(0.4, 0.14, { filter: 320, sweepTo: 90, delay: 0.42 });
  },
  /** A rising whine before the charge. */
  bossCharge(s: Sound): void {
    s.tone(160, 0.55, { type: 'sawtooth', slide: 900, vol: 0.05 });
    s.tone(320, 0.55, { type: 'sine', slide: 1800, vol: 0.03 });
  },
  /** A burst of three shots. */
  bossVolley(s: Sound): void {
    for (let i = 0; i < 3; i++) s.tone(520 - i * 40, 0.09, { type: 'square', slide: -260, vol: 0.04, delay: i * 0.06 });
    s.noise(0.15, 0.09, { filter: 2200 });
  },
  /** A portal warble as minions arrive. */
  bossSummon(s: Sound): void {
    for (let i = 0; i < 6; i++) s.tone(300 + (i % 2 ? 140 : 0) + i * 30, 0.08, { type: 'sine', vol: 0.06, delay: i * 0.06 });
    s.tone(180, 0.5, { type: 'triangle', slide: 600, vol: 0.05 });
    s.noise(0.5, 0.05, { filter: 900, sweepTo: 2600 });
  },
  /** A metallic clang with pitch variation, rate-limited so rapid weapons do not spam it. */
  bossHurt(s: Sound): void {
    const ctx = s.ctx;
    if (!s.enabled || !ctx) return;
    const t = ctx.currentTime;
    const last = lastHurt.get(s);
    if (last !== undefined && t >= last && t - last < HURT_GAP) return;
    lastHurt.set(s, t);
    const p = 1 + (Math.random() - 0.5) * 0.2;
    s.tone(1200 * p, 0.12, { type: 'square', slide: -400 * p, vol: 0.04 });
    s.tone(1870 * p, 0.25, { type: 'triangle', vol: 0.035 });
    s.tone(2650 * p, 0.18, { type: 'triangle', vol: 0.025 });
    s.noise(0.08, 0.08, { filter: 3500 });
  },
  /** A long multi-stage explosion. */
  bossDeath(s: Sound): void {
    s.noise(0.5, 0.35, { filter: 420, sweepTo: 120 });
    s.tone(110, 0.6, { type: 'sine', slide: -70, vol: 0.25 });
    s.noise(0.4, 0.28, { filter: 640, sweepTo: 160, delay: 0.35 });
    s.tone(90, 0.45, { type: 'triangle', slide: -50, vol: 0.16, delay: 0.35 });
    s.noise(0.6, 0.06, { filter: 3200, sweepTo: 1200, delay: 0.5 });
    s.noise(0.45, 0.3, { filter: 300, sweepTo: 90, delay: 0.7 });
    s.noise(1.4, 0.3, { filter: 220, sweepTo: 50, delay: 1.1 });
    s.tone(60, 1.6, { type: 'sine', slide: -20, vol: 0.25, delay: 1.1 });
  },
  /** A shimmering chord as the exit portal unseals. */
  portalOpen(s: Sound): void {
    [523, 659, 784, 988, 1319].forEach((f, i) => {
      s.tone(f, 1, { type: 'triangle', vol: 0.04, delay: i * 0.04 });
      s.tone(f + 5, 1, { type: 'sine', vol: 0.03, delay: i * 0.04 + 0.02 });
    });
    s.noise(0.8, 0.03, { filter: 6000, sweepTo: 9000 });
  },
  /** Victory sting after a boss death (played by the boss track, not by an event). */
  bossVictory(s: Sound): void {
    const d = 0.9;
    [57, 64, 69, 73].forEach((n, i) => s.tone(frequency(n + 12), 0.18, { type: 'square', vol: 0.045, delay: d + i * 0.11 }));
    [69, 73, 76, 81].forEach((n) => s.tone(frequency(n), 0.9, { type: 'triangle', vol: 0.05, delay: d + 0.46 }));
    s.tone(frequency(45), 0.9, { type: 'sine', vol: 0.15, delay: d + 0.46 });
  },
} satisfies Record<string, (s: Sound) => void>;

/** World event type -> effect name, for the GameScene EVENT_SOUNDS table. */
export const BOSS_EVENT_SOUNDS = {
  'boss-intro': 'bossIntro',
  'boss-phase': 'bossPhase',
  'boss-charge': 'bossCharge',
  'boss-volley': 'bossVolley',
  'boss-summon': 'bossSummon',
  'boss-hurt': 'bossHurt',
  'boss-death': 'bossDeath',
  'portal-open': 'portalOpen',
} as const satisfies Partial<Record<WorldEventType, EffectName>>;

/** The world.boss fields syncBossAudio reads (src/core/enemies.ts BossInfo). */
export interface BossAudioInfo {
  hp: number;
  maxHp: number;
  phase: number;
  awake?: boolean;
  defeated?: boolean;
  active?: boolean;
}

const lastSync = new WeakMap<object, string>();

/**
 * Drive the boss track from world.boss. Call once per frame (and with null when the session ends);
 * it only calls setBossMusic when the active/phase/low-hp/defeated state changes. Never throws.
 */
export function syncBossAudio(
  sound: Pick<Sound, 'setBossMusic'>,
  world: { boss?: BossAudioInfo | null } | null | undefined,
): void {
  try {
    const b = world?.boss ?? null;
    const defeated = Boolean(b?.defeated);
    const active = Boolean(b) && !defeated && b!.awake !== false && b!.active !== false && b!.hp > 0;
    const hpRatio = b && b.maxHp > 0 ? b.hp / b.maxHp : 1;
    const phase = active ? Math.min(3, Math.max(1, Math.round(b!.phase) || 1)) : 1;
    const low = active && hpRatio < LOW_HP;
    const key = active ? `on|${phase}|${low}` : defeated ? 'won' : 'off';
    if (lastSync.get(sound) === key) return;
    lastSync.set(sound, key);
    sound.setBossMusic({ active, phase, hpRatio, defeated });
  } catch { /* audio is optional */ }
}
