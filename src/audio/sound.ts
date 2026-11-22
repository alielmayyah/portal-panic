// Original music and effects, synthesized so the single-file build works offline.
import { BossMusic, bossSfx, type BossMusicSnapshot, type BossMusicState } from './boss';

/** The part of a level dimension the music sequencer reads. */
export interface MusicTrack {
  bass: number[];
  beat: number;
}

/** Every one-shot effect, usable as a lookup from world events. */
export const EFFECTS = [
  'jump', 'orb', 'rift', 'hit', 'tick', 'go', 'click', 'launch', 'pulse',
  'targetHit', 'enemyCharge', 'enemyFire', 'wallBreak', 'blast', 'empty', 'boost',
  'bump', 'fall', 'shieldHit', 'gadget', 'win',
  'dodge', 'duck', 'slide', 'cheat', 'crystalHit', 'slimeHit', 'droneHit',
  // Superpowers (src/core/powers.ts POWER_EVENT_SOUNDS).
  'powerTurbo', 'powerMagnet', 'powerFreeze', 'powerGhost', 'powerRapid', 'powerGiant', 'stomp', 'powerEnd',
  // Boss fights (src/audio/boss.ts BOSS_EVENT_SOUNDS).
  'bossIntro', 'bossPhase', 'bossCharge', 'bossVolley', 'bossSummon', 'bossHurt', 'bossDeath', 'portalOpen',
] as const;
export type EffectName = (typeof EFFECTS)[number];

interface ToneOptions {
  type?: OscillatorType;
  vol?: number;
  slide?: number;
  delay?: number;
  music?: boolean;
  /** Music only: which track bus (crossfaded by the boss music). Defaults to the level track. */
  bus?: MusicBus;
}

type MusicBus = 'level' | 'boss';

interface NoiseOptions {
  delay?: number;
  music?: boolean;
  bus?: MusicBus;
  filter?: number;
  /** Optional end frequency for a filter sweep. */
  sweepTo?: number;
}

type AudioContextCtor = new () => AudioContext;

// Each level supplies its own { bass, beat } track; this covers callers or levels that don't.
const FALLBACK_TRACK: MusicTrack = { bass: [36, 36, 43, 36, 39, 39, 46, 43], beat: 0.272 };
const LEAD = [12, 19, 24, 15, 19, 22, 17, 26];
const MASTER_GAIN = 0.72;
const MUSIC_GAIN = 0.44;

const frequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

function findAudioContext(): AudioContextCtor | null {
  try {
    const g = globalThis as typeof globalThis & {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

export class Sound {
  enabled: boolean;
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private levelBus: GainNode | null = null;
  private bossBus: GainNode | null = null;
  private readonly boss = new BossMusic(this);
  private noiseBuffer: AudioBuffer | null = null;
  private beat = 0;
  private nextBeat = 0;
  private playing = false;
  private queueUntil = 0;
  private failed = false;
  private sleeping = false;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  /** Create or resume the context. Call from a user gesture. Never throws. */
  unlock(): void {
    // Muted players get no context; toggling sound on calls unlock() again.
    if (!this.enabled || this.failed) return;
    try {
      if (!this.ctx) {
        const AC = findAudioContext();
        if (!AC) return;
        const ctx = new AC();
        const master = ctx.createGain();
        const music = ctx.createGain();
        music.gain.value = this.playing ? MUSIC_GAIN : 0;
        master.gain.value = this.enabled ? MASTER_GAIN : 0;
        const levelBus = ctx.createGain();
        const bossBus = ctx.createGain();
        levelBus.connect(music);
        bossBus.connect(music);
        music.connect(master);
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
        this.music = music;
        this.levelBus = levelBus;
        this.bossBus = bossBus;
        this.boss.attach(ctx, levelBus, bossBus);
      }
      clearTimeout(this.sleepTimer);
      // A pending suspend() from muting still reports 'running', so resume after it too.
      if (this.ctx.state !== 'running' || this.sleeping) {
        this.sleeping = false;
        // Sounds from the unlocking gesture may play once the context starts; see live().
        this.queueUntil = now() + 500;
        const resumed = this.ctx.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
    } catch {
      // Audio is unavailable here (blocked device, context limit); play silently from now on.
      this.failed = true;
      this.ctx = this.master = this.music = this.levelBus = this.bossBus = null;
      this.boss.detach();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const { ctx, master } = this;
    if (!ctx || !master) return;
    try {
      master.gain.setTargetAtTime(enabled ? MASTER_GAIN : 0, ctx.currentTime, 0.018);
    } catch { /* ignore */ }
    clearTimeout(this.sleepTimer);
    // Let the fade finish, then stop the silent render thread to save battery.
    if (!enabled) {
      this.sleepTimer = setTimeout(() => {
        if (this.enabled || !this.ctx) return;
        this.sleeping = true;
        try {
          const p = this.ctx.suspend();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch { /* ignore */ }
      }, 150);
    }
  }

  /**
   * Effects requested while the context is stopped would all start in the same sample when it
   * resumes, so they are only queued briefly after a resume request.
   */
  private live(): AudioContext | null {
    const { ctx } = this;
    if (!this.enabled || !ctx || !this.master) return null;
    return ctx.state === 'running' || now() < this.queueUntil ? ctx : null;
  }

  playMusic(playing: boolean): void {
    if (playing && !this.playing) {
      this.nextBeat = 0;
      this.beat = 0;
      this.boss.resetSequencer();
    }
    this.playing = playing;
    if (this.music && this.ctx) {
      try {
        this.music.gain.setTargetAtTime(playing ? MUSIC_GAIN : 0, this.ctx.currentTime, 0.045);
      } catch { /* ignore */ }
    }
  }

  /** Schedule upcoming beats. Call every frame with the current level dimension. */
  updateMusic(track?: MusicTrack | null): void {
    const ctx = this.ctx;
    if (!this.playing || !this.enabled || !ctx || ctx.state !== 'running') return;
    const pattern = track?.bass?.length ? track.bass : FALLBACK_TRACK.bass;
    const step = track && track.beat > 0 ? track.beat : FALLBACK_TRACK.beat;
    const t = ctx.currentTime;
    this.boss.update(t);
    // While the boss track holds the mix the level sequencer pauses (it resumes in time for the fade back).
    if (!this.boss.levelAudible(t)) return;
    if (this.nextBeat < t - 0.1) this.nextBeat = t;
    while (this.nextBeat < t + 0.08) {
      const beat = this.beat++;
      const note = pattern[Math.floor(beat / 2) % pattern.length] ?? FALLBACK_TRACK.bass[0]!;
      const root = pattern[0] ?? note;
      const delay = Math.max(0, this.nextBeat - t);
      this.tone(frequency(note), 0.21, { type: 'triangle', vol: 0.14, delay, music: true });
      if (beat % 2 === 0) this.tone(74, 0.11, { type: 'sine', slide: -34, vol: 0.23, delay, music: true });
      if (beat % 4 !== 1) {
        const lead = LEAD[beat % LEAD.length] ?? 12;
        this.tone(frequency(root + 12 + lead), 0.16, { type: 'sine', vol: 0.065, delay, music: true });
      }
      if (beat % 2 === 1) this.noise(0.07, 0.055, { delay, music: true, filter: 4800 });
      this.nextBeat += step;
    }
  }

  /**
   * Boss fight music: crossfades (BOSS_FADE) from the level track to the boss track and back; phase 2-3
   * add layers and tempo, hpRatio < 0.25 adds a heartbeat, and `defeated` on the way out plays the
   * victory sting. Call on change only (syncBossAudio does). Never throws.
   */
  setBossMusic(state: BossMusicState): void {
    try { this.boss.set(state); } catch { /* ignore */ }
  }

  /** Current boss music state (for tests and debugging). */
  get bossMusic(): BossMusicSnapshot {
    return this.boss.state;
  }

  private musicOut(bus: MusicBus | undefined): GainNode | null {
    return (bus === 'boss' ? this.bossBus : this.levelBus) ?? this.music;
  }

  tone(freq: number, dur: number, { type = 'square', vol = 0.05, slide = 0, delay = 0, music = false, bus }: ToneOptions = {}): void {
    const ctx = this.live();
    const out = music ? this.musicOut(bus) : this.master;
    if (!ctx || !out) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* ignore */ }
  }

  noise(dur: number, vol = 0.08, { delay = 0, music = false, filter = 640, sweepTo, bus }: NoiseOptions = {}): void {
    const ctx = this.live();
    const out = music ? this.musicOut(bus) : this.master;
    if (!ctx || !out) return;
    try {
      if (!this.noiseBuffer) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      }
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(filter, t0);
      if (sweepTo) band.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.buffer = this.noiseBuffer;
      src.connect(band).connect(gain).connect(out);
      src.start(t0, Math.random() * 0.5, dur);
    } catch { /* ignore */ }
  }

  /** Play an effect by name; unknown names are ignored. */
  play(name: EffectName | string): void {
    if (!(EFFECTS as readonly string[]).includes(name)) return;
    this[name as EffectName]();
  }

  jump(): void { this.tone(380, 0.14, { slide: 360, vol: 0.035 }); }
  orb(): void {
    this.tone(880, 0.07, { type: 'triangle', vol: 0.06 });
    this.tone(1320, 0.12, { type: 'triangle', vol: 0.06, delay: 0.06 });
  }
  rift(): void {
    [196, 329, 587, 988].forEach((f, i) => this.tone(f, 0.24, { type: 'sine', slide: f * 0.26, vol: 0.06, delay: i * 0.045 }));
  }
  hit(): void {
    this.noise(0.35, 0.12);
    this.tone(220, 0.4, { type: 'sawtooth', slide: -170, vol: 0.06 });
  }
  tick(): void { this.tone(660, 0.09, { type: 'triangle', vol: 0.06 }); }
  go(): void { this.tone(990, 0.22, { type: 'triangle', vol: 0.07 }); }
  click(): void { this.tone(540, 0.04, { type: 'triangle', vol: 0.03 }); }
  launch(): void {
    this.tone(210, 0.23, { type: 'sawtooth', slide: 560, vol: 0.06 });
    this.noise(0.17, 0.13, { filter: 950 });
  }
  pulse(): void { this.tone(630, 0.095, { type: 'triangle', slide: -350, vol: 0.082 }); }
  targetHit(): void { this.tone(190, 0.082, { type: 'square', slide: 70, vol: 0.036 }); }
  enemyCharge(): void { this.tone(190, 0.27, { type: 'sine', slide: 420, vol: 0.055 }); }
  enemyFire(): void { this.tone(360, 0.16, { type: 'sawtooth', slide: -210, vol: 0.043 }); }
  wallBreak(): void {
    this.blast();
    this.noise(0.26, 0.18, { filter: 1250, delay: 0.055 });
    this.tone(86, 0.33, { type: 'sine', slide: -38, vol: 0.19 });
  }
  blast(): void {
    this.noise(0.32, 0.32, { filter: 330 });
    this.tone(140, 0.28, { type: 'triangle', slide: -90, vol: 0.16 });
  }
  empty(): void { this.tone(120, 0.1, { type: 'square', slide: -40, vol: 0.045 }); }
  boost(): void { this.tone(340, 0.29, { type: 'triangle', slide: 1050, vol: 0.09 }); }
  bump(): void { this.tone(138, 0.08, { type: 'triangle', slide: -53, vol: 0.065 }); }
  fall(): void { this.tone(500, 0.42, { type: 'sawtooth', slide: -430, vol: 0.07 }); }
  shieldHit(): void {
    this.tone(640, 0.29, { type: 'triangle', slide: -480, vol: 0.11 });
    this.noise(0.19, 0.16, { filter: 1700 });
  }
  gadget(): void {
    [392, 523, 659, 784].forEach((note, i) => this.tone(note, 0.21, { type: 'triangle', delay: i * 0.07, vol: 0.07 }));
  }
  win(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((note, i) => this.tone(note, 0.25, { type: 'triangle', delay: i * 0.1, vol: 0.095 }));
  }

  // New effects for the port.

  /** Quick whoosh when a shot passes over a ducked runner. */
  dodge(): void {
    this.noise(0.16, 0.11, { filter: 900, sweepTo: 3600 });
    this.tone(520, 0.1, { type: 'sine', slide: 380, vol: 0.03 });
  }
  /** Soft thud on duck start. */
  duck(): void {
    this.tone(110, 0.09, { type: 'sine', slide: -40, vol: 0.1 });
    this.noise(0.06, 0.05, { filter: 260 });
  }
  /** Short noise sweep for a duck slide. */
  slide(): void { this.noise(0.24, 0.09, { filter: 2400, sweepTo: 500 }); }
  /** Arcade chime when a cheat applies. */
  cheat(): void {
    [659, 988, 1319, 1976].forEach((note, i) => this.tone(note, 0.12, { type: 'square', delay: i * 0.05, vol: 0.04 }));
  }
  /** Glassy shatter for crystal deaths. */
  crystalHit(): void {
    this.noise(0.3, 0.14, { filter: 5200, sweepTo: 2200 });
    [2093, 2794, 3520].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', slide: -f * 0.3, vol: 0.05, delay: i * 0.025 }));
    this.tone(220, 0.36, { type: 'sawtooth', slide: -160, vol: 0.045 });
  }
  /** Wet splat for slime deaths. */
  slimeHit(): void {
    this.noise(0.22, 0.13, { filter: 420, sweepTo: 160 });
    this.tone(180, 0.3, { type: 'sine', slide: -120, vol: 0.12 });
  }
  /** Electric zap for drone deaths. */
  droneHit(): void {
    this.tone(880, 0.2, { type: 'sawtooth', slide: -700, vol: 0.05 });
    this.tone(500, 0.14, { type: 'square', slide: -300, vol: 0.035, delay: 0.04 });
    this.noise(0.25, 0.11, { filter: 1800 });
  }

  // Superpowers.

  /** Rising revving sweep. */
  powerTurbo(): void {
    this.tone(220, 0.32, { type: 'sawtooth', slide: 900, vol: 0.05 });
    this.tone(440, 0.18, { type: 'square', slide: 660, vol: 0.03, delay: 0.12 });
  }
  /** Wobbling hum with a pull-in chirp. */
  powerMagnet(): void {
    [300, 360, 300, 420].forEach((f, i) => this.tone(f, 0.1, { type: 'sine', vol: 0.07, delay: i * 0.06 }));
    this.tone(1200, 0.2, { type: 'triangle', slide: -800, vol: 0.04, delay: 0.24 });
  }
  /** Icy descending chime with a crackle. */
  powerFreeze(): void {
    [2637, 2093, 1568, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'sine', vol: 0.05, delay: i * 0.05 }));
    this.noise(0.3, 0.08, { filter: 6000, sweepTo: 1500 });
  }
  /** Airy, detuned whoosh. */
  powerGhost(): void {
    this.noise(0.4, 0.07, { filter: 700, sweepTo: 2800 });
    this.tone(523, 0.38, { type: 'sine', slide: -140, vol: 0.05 });
    this.tone(531, 0.38, { type: 'sine', slide: -150, vol: 0.05 });
  }
  /** Fast staccato ticks. */
  powerRapid(): void {
    for (let i = 0; i < 6; i++) this.tone(880 + i * 90, 0.04, { type: 'square', vol: 0.035, delay: i * 0.035 });
  }
  /** Deep growing boom. */
  powerGiant(): void {
    this.tone(70, 0.5, { type: 'sine', slide: 60, vol: 0.2 });
    this.tone(140, 0.4, { type: 'sawtooth', slide: -60, vol: 0.05, delay: 0.05 });
    this.noise(0.3, 0.12, { filter: 240 });
  }
  /** Heavy crunch when a giant flattens something. */
  stomp(): void {
    this.noise(0.22, 0.25, { filter: 300, sweepTo: 90 });
    this.tone(95, 0.22, { type: 'square', slide: -55, vol: 0.09 });
  }
  /** Soft falling blip when a power wears off. */
  powerEnd(): void { this.tone(660, 0.18, { type: 'triangle', slide: -330, vol: 0.045 }); }

  // Boss fights (bodies in src/audio/boss.ts).

  bossIntro(): void { bossSfx.bossIntro(this); }
  bossPhase(): void { bossSfx.bossPhase(this); }
  bossCharge(): void { bossSfx.bossCharge(this); }
  bossVolley(): void { bossSfx.bossVolley(this); }
  bossSummon(): void { bossSfx.bossSummon(this); }
  /** Rate-limited (HURT_GAP) with pitch variation. */
  bossHurt(): void { bossSfx.bossHurt(this); }
  bossDeath(): void { bossSfx.bossDeath(this); }
  portalOpen(): void { bossSfx.portalOpen(this); }
  /** Victory sting; played by setBossMusic({ active: false, defeated: true }), not by an event. */
  bossVictory(): void { bossSfx.bossVictory(this); }
}
