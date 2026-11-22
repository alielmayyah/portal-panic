// Each level supplies its own { bass, beat } track; this covers callers or levels that don't.
const FALLBACK_TRACK = { bass: [36, 36, 43, 36, 39, 39, 46, 43], beat: .272 };
const LEAD = [12, 19, 24, 15, 19, 22, 17, 26];
const frequency = (note) => 440 * 2 ** ((note - 69) / 12);

// Original music and effects, synthesized so the single-file build works offline.
export class Sound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.beat = 0;
    this.nextBeat = 0;
    this.playing = false;
    this.queueUntil = 0;
  }

  unlock() {
    // Muted players get no context; toggleSound() calls unlock() again after unmuting.
    if (!this.enabled || this.failed) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const master = ctx.createGain();
        const music = ctx.createGain();
        music.gain.value = this.playing ? .44 : 0;
        master.gain.value = this.enabled ? .72 : 0;
        music.connect(master);
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
        this.music = music;
      }
      clearTimeout(this.sleepTimer);
      // A pending suspend() from muting still reports 'running', so resume after it too.
      if (this.ctx.state !== 'running' || this.sleeping) {
        this.sleeping = false;
        // Sounds from the unlocking gesture may play once the context starts; see audible().
        this.queueUntil = performance.now() + 500;
        this.ctx.resume().catch(() => {});
      }
    } catch {
      // Audio is unavailable here (blocked device, context limit); play silently from now on.
      this.failed = true;
      this.ctx = this.master = this.music = null;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.master) return;
    this.master.gain.setTargetAtTime(enabled ? .72 : 0, this.ctx.currentTime, .018);
    clearTimeout(this.sleepTimer);
    // Let the fade finish, then stop the silent render thread to save battery.
    if (!enabled) this.sleepTimer = setTimeout(() => {
      if (this.enabled || !this.ctx) return;
      this.sleeping = true;
      this.ctx.suspend().catch(() => {});
    }, 150);
  }

  // Effects requested while the context is stopped would all start in the same sample when it
  // resumes, so they are only queued briefly after a resume request.
  audible() {
    return this.enabled && this.ctx && (this.ctx.state === 'running' || performance.now() < this.queueUntil);
  }

  playMusic(playing) {
    if (playing && !this.playing) {
      this.nextBeat = 0;
      this.beat = 0;
    }
    this.playing = playing;
    if (this.music) this.music.gain.setTargetAtTime(playing ? .44 : 0, this.ctx.currentTime, .045);
  }

  updateMusic(track) {
    if (!this.playing || !this.enabled || this.ctx?.state !== 'running') return;
    const { bass: pattern = FALLBACK_TRACK.bass, beat: step = FALLBACK_TRACK.beat } = track ?? {};
    const now = this.ctx.currentTime;
    if (this.nextBeat < now - .1) this.nextBeat = now;
    while (this.nextBeat < now + .08) {
      const beat = this.beat++;
      const note = pattern[Math.floor(beat / 2) % pattern.length];
      const delay = Math.max(0, this.nextBeat - now);
      this.tone(frequency(note), .21, { type: 'triangle', vol: .14, delay, music: true });
      if (beat % 2 === 0) this.tone(74, .11, { type: 'sine', slide: -34, vol: .23, delay, music: true });
      if (beat % 4 !== 1) {
        this.tone(frequency(pattern[0] + 12 + LEAD[beat % LEAD.length]), .16, { type: 'sine', vol: .065, delay, music: true });
      }
      if (beat % 2 === 1) this.noise(.07, .055, { delay, music: true, filter: 4800 });
      this.nextBeat += step;
    }
  }

  tone(freq, dur, { type = 'square', vol = 0.05, slide = 0, delay = 0, music = false } = {}) {
    if (!this.audible()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + .006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(music ? this.music : this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.08, { delay = 0, music = false, filter = 640 } = {}) {
    if (!this.audible()) return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = filter;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.buffer = this.noiseBuffer;
    src.connect(band).connect(gain).connect(music ? this.music : this.master);
    src.start(t0, Math.random() * .5, dur);
  }

  jump() { this.tone(380, 0.14, { slide: 360, vol: 0.035 }); }
  orb() { this.tone(880, 0.07, { type: 'triangle', vol: 0.06 }); this.tone(1320, 0.12, { type: 'triangle', vol: 0.06, delay: 0.06 }); }
  rift() { [196, 329, 587, 988].forEach((f, i) => this.tone(f, 0.24, { type: 'sine', slide: f * .26, vol: 0.06, delay: i * 0.045 })); }
  hit() { this.noise(0.35, 0.12); this.tone(220, 0.4, { type: 'sawtooth', slide: -170, vol: 0.06 }); }
  tick() { this.tone(660, 0.09, { type: 'triangle', vol: 0.06 }); }
  go() { this.tone(990, 0.22, { type: 'triangle', vol: 0.07 }); }
  click() { this.tone(540, 0.04, { type: 'triangle', vol: 0.03 }); }
  launch() {
    this.tone(210, .23, { type: 'sawtooth', slide: 560, vol: .06 });
    this.noise(.17, .13, { filter: 950 });
  }
  pulse() { this.tone(630, .095, { type: 'triangle', slide: -350, vol: .082 }); }
  targetHit() { this.tone(190, .082, { type: 'square', slide: 70, vol: .036 }); }
  enemyCharge() { this.tone(190, .27, { type: 'sine', slide: 420, vol: .055 }); }
  enemyFire() { this.tone(360, .16, { type: 'sawtooth', slide: -210, vol: .043 }); }
  wallBreak() {
    this.blast();
    this.noise(.26, .18, { filter: 1250, delay: .055 });
    this.tone(86, .33, { type: 'sine', slide: -38, vol: .19 });
  }
  blast() {
    this.noise(.32, .32, { filter: 330 });
    this.tone(140, .28, { type: 'triangle', slide: -90, vol: .16 });
  }
  empty() { this.tone(120, .1, { type: 'square', slide: -40, vol: .045 }); }
  boost() { this.tone(340, .29, { type: 'triangle', slide: 1050, vol: .09 }); }
  bump() { this.tone(138, .08, { type: 'triangle', slide: -53, vol: .065 }); }
  fall() { this.tone(500, .42, { type: 'sawtooth', slide: -430, vol: .07 }); }
  shieldHit() {
    this.tone(640, .29, { type: 'triangle', slide: -480, vol: .11 });
    this.noise(.19, .16, { filter: 1700 });
  }
  gadget() { [392, 523, 659, 784].forEach((note, index) => this.tone(note, .21, { type: 'triangle', delay: index * .07, vol: .07 })); }
  win() { [523, 659, 784, 1047, 784, 1047].forEach((note, index) => this.tone(note, .25, { type: 'triangle', delay: index * .1, vol: .095 })); }
}
