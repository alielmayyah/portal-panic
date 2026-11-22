// The race scene: owns the World and the session phases (port of the session code in the old src/main.js).
// It talks to React only through the store (HUD snapshot, dialog, countdown, toasts, records) and the bus.
import Phaser from 'phaser';
import { sound, unlockSound } from '../audio/instance';
import { BOSS_EVENT_SOUNDS, syncBossAudio } from '../audio/boss';
import type { EffectName } from '../audio/sound';
import { applyCheat } from '../core/cheats';
import { CONTROL_SCHEMES, ControlState, SCROLL_KEYS, keyMapFor, keyName } from '../core/input';
import { LEVELS } from '../core/levels';
import { MONSTERS, bossHud, portalSealed } from '../core/enemies';
import { POWER_EVENT_SOUNDS, POWERS, isPowerKind, withPowerStatus } from '../core/powers';
import { loadoutFor } from '../core/shop';
import { chargeLevel, collectRunCoins, currentWeapon, equipRun, runCoins } from '../core/weapons';
import {
  actions, bus, shopState, store,
  type CheatCommand, type DialogContent, type HudSnapshot, type RunnerHud, type SessionPhase, type StartCommand, type TouchCommand,
} from '../core/store';
import type { DeathCause, Mode, Runner, WorldEvent, WorldEventType } from '../core/types';
import { GADGETS, GROUND_Y, H, MAX_MISSILES, PLAYER_COLORS, STEP_MS, World, createRunner, isDeathEvent } from '../core/world';
import { type DustPuff, drawWorld, dustPuffFor, worldLabels } from './draw';
import { pixelRatio, placeCamera, reducedMotion } from './viewport';

export const COUNTDOWN_MS: Readonly<Record<Mode, number>> = { solo: 1250, versus: 2450 };
export const CROSSING_MS = 1250;
export const PULL_MS = 510;
/** Steps a race toast stays up (old raceMessage). */
const MESSAGE_TICKS = 155;
/** Minimum steps between two "Dodged!" toasts. */
const DODGE_TOAST_TICKS = 150;
/** Minimum steps between two "Stomp!" toasts and between two sealed-portal hints. */
const STOMP_TOAST_TICKS = 90;
const SEALED_TOAST_TICKS = 240;
/** Stop repainting a finished run once its effects have faded under the result dialog. */
const OVER_REPAINT_MS = 2000;
/** Versus camera: world units kept free on each side of the racers, and the smallest zoom vs. the normal scale. */
const VERSUS_MARGIN = 120;
const VERSUS_MIN_ZOOM = .45;
/** Runner sprite width in world units (x is the left edge). */
const RUNNER_WIDTH = 44;
/**
 * Below this canvas size (device px) the scene does not draw: a detached or collapsed stage would give a
 * near-zero camera scale, and the "min 10 CSS px" label rule would then ask for gigantic text textures
 * (WebGL "texImage2D: width or height out of range").
 */
const MIN_DRAW_PX = 32;
/** Largest label font in CSS px, whatever the zoom. */
const MAX_LABEL_CSS_PX = 48;

export const CHARACTERS = {
  rick: { name: 'Rick', character: 'rick', color: PLAYER_COLORS[0] },
  morty: { name: 'Morty', character: 'morty', color: PLAYER_COLORS[1] },
} as const;

const EVENT_SOUNDS: Partial<Record<WorldEventType, EffectName>> = {
  jump: 'jump', orb: 'orb', launch: 'launch', blast: 'blast', empty: 'empty', boost: 'boost', bump: 'bump',
  fall: 'fall', 'sentry-hit': 'hit', 'crystal-hit': 'crystalHit', 'slime-hit': 'slimeHit', 'drone-hit': 'droneHit',
  'shield-hit': 'shieldHit', shield: 'gadget', boots: 'gadget', checkpoint: 'gadget', respawn: 'rift', regroup: 'rift',
  pulse: 'pulse', 'target-hit': 'targetHit', 'wall-break': 'wallBreak', 'enemy-charge': 'enemyCharge', 'enemy-fire': 'enemyFire',
  dodge: 'dodge', duck: 'duck', slide: 'slide', coin: 'orb', 'weapon-swap': 'click',
  // Monsters (enemies.ts).
  hop: 'bump', swoop: 'enemyCharge', spit: 'enemyFire', 'armor-block': 'shieldHit', split: 'slimeHit',
  // Superpowers (powers.ts).
  ...POWER_EVENT_SOUNDS,
  // Boss fight (audio/boss.ts).
  ...BOSS_EVENT_SOUNDS,
};

/** Result titles per death cause (every cause has one; RESULT_FALLBACK covers anything unexpected). */
const RESULT_TITLES: Readonly<Record<DeathCause, string>> = {
  fall: 'You fell into a pit',
  'sentry-hit': 'A sentry hit you',
  'crystal-hit': 'Impaled on a crystal',
  'slime-hit': 'A slime got you',
  'drone-hit': 'You crashed into a drone',
  'hopper-hit': 'Flattened by a gloop hopper',
  'swooper-hit': 'Swooped and scooped',
  'spitter-hit': 'Gooed by a bile spitter',
  'brute-hit': 'Bulldozed by a plated brute',
  'splitter-hit': 'Double-teamed by twin blobs',
  'boss-hit': 'The boss crushed you',
};
const RESULT_FALLBACK = 'You were hit';

/** Result title for a solo death; the boss title names the boss of this level. */
export function resultTitle(cause: DeathCause | null, bossName?: string | null): string {
  if (!cause) return RESULT_FALLBACK;
  if (cause === 'boss-hit' && bossName) return `${bossName} crushed you`;
  return RESULT_TITLES[cause] ?? RESULT_FALLBACK;
}

const LIVE: readonly SessionPhase[] = ['ready', 'running', 'crossing'];

interface Session {
  mode: Mode;
  pilot: StartCommand['pilot'];
  world: World;
  phase: SessionPhase;
  timer: number;
  acc: number;
  controls: ControlState;
  canRetry: boolean;
  overAt: number;
  messageTicks: number;
  messageId: number;
  lastDodgeTick: number;
  lastStompTick: number;
  lastSealedTick: number;
  stepCount: number;
}

interface Finger { runner: number; action: 'jump'; }

export class GameScene extends Phaser.Scene {
  private session: Session | null = null;
  private pendingStart: StartCommand | null = null;
  private ready = false;
  private bg!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private puffs: DustPuff[] = [];
  private lastHudKey = '';
  private swallowSpaceUp = false;
  private fingers = new Map<number, Finger>();
  private blurTimer = 0;
  private cleanup: (() => void)[] = [];

  constructor() {
    super({ key: 'game' });
    // Subscribe right away: React may emit 'start' before Phaser has booted the scene.
    const on = bus.on.bind(bus);
    this.cleanup.push(
      on('start', (cmd) => this.onStart(cmd)),
      on('pause', () => this.pause()),
      on('resume', () => this.resume()),
      on('retry', () => this.retry()),
      on('home', () => this.home()),
      on('cheat', (cmd) => this.onCheat(cmd)),
      on('touch-press', (cmd) => this.touchPress(cmd)),
      on('touch-release', (cmd) => this.touchRelease(cmd)),
    );
  }

  create(): void {
    this.bg = this.add.graphics().setScrollFactor(0, 1).setDepth(0);
    this.layer = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setScrollFactor(0, 1).setDepth(3);
    this.ready = true;
    this.listen();
    if (this.pendingStart) {
      const cmd = this.pendingStart;
      this.pendingStart = null;
      this.start(cmd.mode, cmd.level, cmd.pilot);
    }
  }

  // ---------- DOM input ----------

  private listen(): void {
    const add = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opts);
      this.cleanup.push(() => window.removeEventListener(type, fn, opts));
    };
    add('keydown', (e) => this.keyDown(e));
    add('keyup', (e) => this.keyUp(e));
    add('blur', () => {
      const s = this.session;
      if (!s) return;
      this.clearInput();
      // Pause when focus really leaves the page, so the run does not continue unattended.
      clearTimeout(this.blurTimer);
      this.blurTimer = window.setTimeout(() => { if (!document.hasFocus() && this.session?.phase === 'running') this.pause(); }, 150);
    });
    for (const name of ['pointerup', 'pointercancel'] as const) add(name, (e) => this.releaseFinger(e.pointerId));
    const visibility = () => {
      if (document.hidden) { if (this.session?.phase === 'running') this.pause(); }
      else if (sound.enabled && sound.ctx && sound.ctx.state !== 'running') unlockSound();
    };
    document.addEventListener('visibilitychange', visibility);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', visibility));

    // Tapping the course makes the solo runner jump (old #track pointerdown).
    const canvas = this.game.canvas;
    const down = (e: PointerEvent) => {
      const s = this.session;
      if (!s || s.mode !== 'solo' || e.button !== 0 || !LIVE.includes(s.phase)) return;
      e.preventDefault();
      this.fingers.set(e.pointerId, { runner: 0, action: 'jump' });
      s.controls.press(0, 'jump', `pointer:${e.pointerId}`, s.phase === 'running');
      canvas.setPointerCapture?.(e.pointerId);
    };
    const lost = (e: PointerEvent) => this.releaseFinger(e.pointerId);
    const menu = (e: Event) => { if (this.session) e.preventDefault(); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('lostpointercapture', lost);
    canvas.addEventListener('contextmenu', menu);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('lostpointercapture', lost);
      canvas.removeEventListener('contextmenu', menu);
    });
  }

  private releaseFinger(id: number): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    this.fingers.delete(id);
    this.session?.controls.release(finger.runner, finger.action, `pointer:${id}`);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') this.swallowSpaceUp = false;
    // Right Ctrl is Morty's weapon swap, so its own keydown (ctrlKey set) must get through.
    if (e.altKey || (e.ctrlKey && e.code !== 'ControlRight') || e.metaKey) return;
    const s = this.session;
    if (!s) return;
    const target = e.target;
    // The cheat console (and any other text field) owns its keys.
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    const live = LIVE.includes(s.phase);
    // Tab would move focus off the course (to the address bar or the Garage button) mid-run.
    if (e.code === 'Tab' && live) { e.preventDefault(); return; }
    const mapping = keyMapFor(s.mode)[e.code];
    if (!live || !(mapping || SCROLL_KEYS.includes(e.code))) return;
    if (['Space', 'Enter', 'NumpadEnter'].includes(e.code) && target instanceof HTMLButtonElement && !target.dataset.touch) return;
    e.preventDefault();
    if (e.code === 'Space') this.swallowSpaceUp = true;
    if (!mapping) return;
    const [runner, action] = mapping;
    if (!e.repeat) s.controls.press(runner, action, e.code, s.phase === 'running');
    // Auto-repeat re-arms a direction or blaster still held after pause, blur or a level change.
    else s.controls.repeat(runner, action, e.code);
  }

  private keyUp(e: KeyboardEvent): void {
    // A Space press the game consumed must not click a button that gained focus before its release.
    if (this.swallowSpaceUp && e.code === 'Space') {
      this.swallowSpaceUp = false;
      e.preventDefault();
    }
    const s = this.session;
    if (!s) return;
    const mapping = keyMapFor(s.mode)[e.code];
    if (mapping) s.controls.release(mapping[0], mapping[1], e.code);
  }

  private touchPress({ runner, action, id }: TouchCommand): void {
    const s = this.session;
    if (!s || !LIVE.includes(s.phase)) return;
    s.controls.press(runner, action, `touch:${id}`, s.phase === 'running');
  }

  private touchRelease({ runner, action, id }: TouchCommand): void {
    this.session?.controls.release(runner, action, `touch:${id}`);
  }

  private clearInput(): void {
    this.session?.controls.clear();
    this.fingers.clear();
  }

  // ---------- Session ----------

  private onStart(cmd: StartCommand): void {
    if (!this.ready) { this.pendingStart = cmd; return; }
    this.start(cmd.mode, cmd.level, cmd.pilot);
  }

  private start(mode: Mode, level: number, pilot: StartCommand['pilot']): void {
    actions.setMode(mode);
    // Restarting mid-run (rematch, play again) banks what the old run earned.
    if (this.session) actions.addCoins(collectRunCoins(this.session.world));
    const versus = mode === 'versus';
    const runner = createRunner({ ...(versus ? CHARACTERS.rick : CHARACTERS[pilot]) });
    const rival = versus ? createRunner({ ...CHARACTERS.morty }) : undefined;
    const world = new World(rival ? { runner, rival, level } : { runner, level });
    // Shop loadouts (weapons, missile rack, pocket shield) per pilot; also arms run coins.
    equipRun(world, world.runners.map((r) => loadoutFor(shopState(), r.character)));
    this.session = {
      mode, pilot, world, phase: 'ready', timer: 0, acc: 0, controls: new ControlState(world.runners.length),
      canRetry: false, overAt: 0, messageTicks: 0, messageId: -1, lastDodgeTick: -Infinity,
      lastStompTick: -Infinity, lastSealedTick: -Infinity, stepCount: 0,
    };
    this.fingers.clear();
    this.puffs = [];
    store.setState({ screen: 'game' });
    unlockSound();
    this.enterReady();
  }

  private enterReady(): void {
    const s = this.session;
    if (!s) return;
    s.phase = 'ready';
    s.timer = COUNTDOWN_MS[s.mode];
    s.acc = 0;
    const versus = s.mode === 'versus';
    store.setState({
      dialog: null,
      countdown: { kind: 'ready', label: versus ? 'RACE TO THE PORTAL' : `LEVEL ${s.world.level + 1}`, text: versus ? '3' : 'READY' },
    });
    this.clearToast();
    sound.playMusic(false);
    syncBossAudio(sound, null);
    sound.tick();
    s.world.snapCamera = true;
  }

  private pause(): void {
    const s = this.session;
    if (s?.phase !== 'running') return;
    s.phase = 'paused';
    this.clearInput();
    sound.playMusic(false);
    const checkpoint = s.world.runner.checkpoint && !s.world.versus ? ' · Checkpoint reached' : '';
    store.setState({ dialog: { kind: 'pause', title: 'Paused', detail: s.world.dimension.name + checkpoint } });
  }

  private resume(): void {
    const s = this.session;
    if (s?.phase !== 'paused') return;
    s.phase = 'running';
    s.acc = 0;
    store.setState({ dialog: null });
    unlockSound();
    sound.playMusic(true);
  }

  private retry(): void {
    const s = this.session;
    if (!s) return;
    if (s.canRetry) {
      s.canRetry = false;
      s.world.retry();
      this.puffs = [];
      unlockSound();
      this.enterReady();
    } else this.start(s.mode, s.mode === 'versus' ? s.world.level : 0, s.pilot);
  }

  private home(): void {
    const s = this.session;
    if (!s) return;
    if (s.phase !== 'crossing') actions.selectLevel(s.mode, s.world.level);
    if (s.mode === 'solo') actions.bankBest(s.world.score, s.world.cheatsUsed);
    actions.addCoins(collectRunCoins(s.world));
    this.clearInput();
    this.session = null;
    this.puffs = [];
    this.lastHudKey = '';
    sound.playMusic(false);
    syncBossAudio(sound, null);
    store.setState({ screen: 'menu', session: null, dialog: null, countdown: null, message: null });
    this.clearLayers();
  }

  private finish(completed: boolean, cause: DeathCause | null): void {
    const s = this.session;
    if (!s) return;
    const { world, mode } = s;
    s.phase = 'over';
    s.overAt = performance.now();
    this.clearInput();
    this.clearToast();
    sound.playMusic(false);
    if (completed) sound.win();
    let title: string;
    let detail: string;
    let retryLabel: string;
    let newBest = false;
    if (mode === 'versus') {
      title = world.winner ? `${world.winner.name} wins!` : 'A portal photo finish!';
      detail = world.winner ? `${world.winner.name} reached the exit first.` : 'Rick and Morty entered at the same time.';
      retryLabel = 'Rematch';
    } else {
      actions.recordRun(world.cheatsUsed);
      newBest = actions.bankBest(world.score, world.cheatsUsed);
      title = completed ? 'Back in the garage!' : resultTitle(cause, world.boss?.name);
      detail = completed ? `You cleared ${LEVELS[LEVELS.length - 1]!.name} and made it home.`
        : world.runner.checkpoint ? 'Your checkpoint is ready.' : `Restart from the beginning of ${world.dimension.name}.`;
      if (world.cheatsUsed) detail += ' Cheats were on, so this run was not saved.';
      retryLabel = completed ? 'Play again' : world.runner.checkpoint ? 'Retry from checkpoint' : 'Retry level';
      if (!completed) s.canRetry = true;
    }
    const coins = collectRunCoins(world, completed);
    actions.addCoins(coins);
    if (coins) detail += ` +${coins} coins banked.`;
    const dialog: DialogContent = {
      kind: 'result', tag: newBest ? 'NEW PERSONAL BEST' : null, title, detail, retryLabel, completed, cause,
      stats: world.runners.map((r) => ({ name: r.name, color: r.color, score: world.scoreFor(r), kills: r.kills, walls: r.walls })),
    };
    store.setState({ dialog, countdown: null });
    this.pushHud();
    const winner = world.winner ? world.runners.indexOf(world.winner) : -1;
    bus.emit('finish', {
      mode, completed, cause, level: world.level, scores: world.runners.map((r) => world.scoreFor(r)),
      winner: mode === 'versus' && winner >= 0 ? winner : null, cheatsUsed: world.cheatsUsed, newBest,
    });
  }

  private enterPortal(): void {
    const s = this.session;
    if (!s) return;
    const { world, mode } = s;
    sound.playMusic(false);
    sound.rift();
    if (mode === 'solo') actions.recordCleared(world.level);
    const last = mode === 'versus' || world.level === LEVELS.length - 1;
    const winnerIndex = world.winner ? world.runners.indexOf(world.winner) : -1;
    const payload = {
      mode, level: world.level, nextLevel: last ? null : world.level + 1,
      winner: winnerIndex >= 0 ? winnerIndex : null, cheatsUsed: world.cheatsUsed,
    };
    if (last) {
      this.finish(true, null);
      bus.emit('portal-enter', payload);
      return;
    }
    actions.bankBest(world.score, world.cheatsUsed);
    actions.selectLevel('solo', world.level + 1);
    // Keep held directions so the runner moves at GO on the next level; drop taps and a held jump.
    s.controls.clearForCrossing();
    s.phase = 'crossing';
    s.timer = CROSSING_MS;
    this.clearToast();
    store.setState({ countdown: { kind: 'crossing', label: 'ENTERING', text: LEVELS[world.level + 1]!.name } });
    this.pushHud();
    bus.emit('portal-enter', payload);
  }

  private onCheat({ code }: CheatCommand): void {
    const s = this.session;
    if (!s) return;
    const result = applyCheat(s.world, code);
    if (result.ok) {
      if (result.unlockAll) actions.unlockAll();
      sound.cheat();
      this.notify(result.label);
    }
    bus.emit('cheat-result', result);
  }

  // ---------- Toasts ----------

  private notify(text: string): void {
    const s = this.session;
    actions.notify(text);
    if (!s) return;
    s.messageTicks = MESSAGE_TICKS;
    s.messageId = store.getState().message?.id ?? -1;
  }

  private clearToast(): void {
    const s = this.session;
    if (s) s.messageTicks = 0;
    if (store.getState().message) actions.clearMessage();
  }

  private tickToast(s: Session): void {
    if (!s.messageTicks || --s.messageTicks) return;
    // Only clear our own toast; the UI may have shown a newer one.
    if (store.getState().message?.id === s.messageId) actions.clearMessage();
  }

  // ---------- World events ----------

  private handleEvents(s: Session): void {
    const { world } = s;
    for (const event of world.events.splice(0)) {
      if (this.session !== s) return;
      this.handleEvent(s, event);
    }
  }

  private handleEvent(s: Session, { type, runner }: WorldEvent): void {
    const { world } = s;
    const index = runner ? world.runners.indexOf(runner) : -1;
    bus.emit('game-event', { type, runner: index >= 0 ? index : null, runnerName: runner?.name ?? null, versus: world.versus });
    const effect = EVENT_SOUNDS[type] ?? (isDeathEvent(type) ? 'hit' : undefined);
    if (effect) sound.play(effect);
    const label = world.versus && runner ? runner.name + ' · ' : '';
    switch (type) {
      case 'portal': this.enterPortal(); return;
      case 'checkpoint': this.notify(label + 'Checkpoint saved'); return;
      case 'shield': this.notify(label + GADGETS.shield.name + ' · one hit protected'); return;
      case 'boots': this.notify(label + GADGETS.boots.name + ' · jump again in midair'); return;
      case 'empty': this.notify(label + 'Collect a green cell to reload'); return;
      case 'wall-blocked': this.notify(label + 'Shoot the cracked wall to break through'); return;
      case 'wall-break': this.notify(label + 'Wall breached'); return;
      case 'regroup': this.notify(label + 'Warped back onto the shared screen'); return;
      case 'shield-hit': this.notify(label + 'Shield absorbed the hit'); return;
      case 'dodge':
        if (s.stepCount - s.lastDodgeTick < DODGE_TOAST_TICKS) return;
        s.lastDodgeTick = s.stepCount;
        this.notify(label + 'Dodged!');
        return;
      case 'drone-warning': this.notify(label + `Drone charging · duck (${this.duckKeys(s, index)}) to dodge`); return;
      case 'duck':
        if (runner) this.puffs.push(dustPuffFor(runner));
        return;
      case 'stomp':
        if (s.stepCount - s.lastStompTick < STOMP_TOAST_TICKS) return;
        s.lastStompTick = s.stepCount;
        this.notify(label + 'Stomp!');
        return;
      case 'boss-intro': this.notify(`${this.bossName(s)} awakens!`); return;
      case 'boss-phase': this.notify(`Phase ${world.boss?.phase ?? 2}`); return;
      case 'boss-death': this.bossDeathFx(); return;
      case 'portal-open': this.notify('The portal is open!'); return;
      default:
        if (isPowerKind(type)) {
          const power = POWERS[type];
          this.notify(`${label}${power.name} · ${power.blurb}`);
          return;
        }
        if (isDeathEvent(type)) {
          if (world.versus) this.notify(label + 'Returning to checkpoint');
          else this.finish(false, type);
        }
    }
  }

  private bossName(s: Session): string {
    return s.world.boss?.name ?? MONSTERS.boss.name;
  }

  /** Big camera flash and shake when a boss falls (the world adds its own shake; skipped under reduced motion). */
  private bossDeathFx(): void {
    if (reducedMotion()) return;
    const camera = this.cameras.main;
    camera.flash(320, 255, 236, 200, true);
    camera.shake(520, .012, true);
  }

  /** "Defeat <boss>" hint while a runner stands at a sealed exit portal (rate-limited). */
  private checkSealedPortal(s: Session): void {
    const { world } = s;
    if (!world.boss || s.stepCount - s.lastSealedTick < SEALED_TOAST_TICKS || !portalSealed(world)) return;
    const exit = world.dimension.exit;
    const at = world.runners.find((r) => r.alive && Math.abs(r.x + 22 - exit) < 40 && r.feet > GROUND_Y - 94 && r.feet <= GROUND_Y + 1);
    if (!at) return;
    s.lastSealedTick = s.stepCount;
    const label = world.versus ? at.name + ' · ' : '';
    this.notify(`${label}Defeat ${this.bossName(s)} to open the portal`);
  }

  private duckKeys(s: Session, index: number): string {
    const schemes = CONTROL_SCHEMES[s.mode];
    const scheme = schemes[Math.max(0, Math.min(schemes.length - 1, index))]!;
    return (scheme.keys[2] ?? []).map(keyName).join('/');
  }

  // ---------- HUD ----------

  /** Pushes a HUD snapshot only when it changed (called once per frame, and before 'finish'/'portal-enter'). */
  private pushHud(): void {
    const s = this.session;
    if (!s) return;
    const { world } = s;
    const dim = world.dimension;
    const runners: RunnerHud[] = world.runners.map((r) => this.runnerHud(world, r));
    const snapshot: HudSnapshot = {
      phase: s.phase, mode: s.mode, level: world.level, levelCount: LEVELS.length, levelCode: dim.code, levelName: dim.name,
      checkpointPct: (dim.checkpoint / dim.exit) * 100,
      checkpointReached: Boolean(world.runner.checkpoint) && !world.versus,
      runners, cheats: world.cheatsUsed, boss: bossHud(world),
    };
    const key = JSON.stringify(snapshot);
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    store.setState({ session: snapshot });
  }

  private runnerHud(world: World, r: Runner): RunnerHud {
    const percent = Math.round(Math.min(1, Math.max(0, (r.x - r.startX) / (world.dimension.exit - r.startX))) * 200) / 2;
    let gadget = '';
    if (!r.alive && world.versus) gadget = 'Respawning…';
    else if (r.boots && r.shield) gadget = `Shield + boots ${Math.ceil(r.boots / 60)}s`;
    else if (r.boots) gadget = `Double jump ${Math.ceil(r.boots / 60)}s`;
    else if (r.shield) gadget = 'Shield ready';
    if (r.alive || !world.versus) gadget = withPowerStatus(gadget, r);
    return {
      name: r.name, color: r.color, character: r.character, score: Math.max(0, world.scoreFor(r)), missiles: r.missiles,
      maxMissiles: r.maxMissiles ?? MAX_MISSILES, shield: r.shield, bootsSeconds: r.boots ? Math.ceil(r.boots / 60) : 0, gadget,
      progress: percent, alive: r.alive, god: r.god, infiniteAmmo: r.infiniteAmmo,
      weapon: currentWeapon(r).name, weaponId: currentWeapon(r).id, coins: runCoins(r), charge: Math.round(chargeLevel(r) * 10) / 10,
    };
  }

  // ---------- Loop ----------

  override update(_time: number, delta: number): void {
    const s = this.session;
    if (!s) return;
    const dt = Math.min(delta, 75);
    let steps = 0;
    if (s.phase === 'running') {
      s.acc += dt;
      while (s.acc >= STEP_MS && s.phase === 'running' && this.session === s) {
        s.acc -= STEP_MS;
        s.controls.apply(s.world.runners);
        s.world.step();
        s.stepCount++;
        steps++;
        this.agePuffs();
        this.handleEvents(s);
        if (this.session !== s || s.phase !== 'running') break;
        this.checkSealedPortal(s);
        this.tickToast(s);
      }
      if (this.session !== s) return;
      if (s.phase === 'running') { syncBossAudio(sound, s.world); sound.updateMusic(s.world.dimension); }
    } else if (s.phase !== 'paused') {
      // The world waits, but particles, shake and flashes keep the fixed simulation rate.
      s.acc += dt;
      while (s.acc >= STEP_MS) {
        s.acc -= STEP_MS;
        s.world.updateEffects();
        this.agePuffs();
        steps++;
      }
      if (s.phase === 'ready') {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.phase = 'running';
          store.setState({ countdown: null });
          sound.go();
          sound.playMusic(true);
        } else if (s.mode === 'versus') {
          const next = String(Math.ceil(s.timer / (COUNTDOWN_MS.versus / 3)));
          const countdown = store.getState().countdown;
          if (countdown && countdown.text !== next) {
            store.setState({ countdown: { ...countdown, text: next } });
            sound.tick();
          }
        }
      } else if (s.phase === 'crossing') {
        s.timer -= dt;
        s.world.portalPull = Math.min(1, (CROSSING_MS - s.timer) / PULL_MS);
        if (s.timer <= 0) {
          s.world.nextLevel();
          this.puffs = [];
          this.enterReady();
        }
      }
    }
    this.pushHud();
    // The result card covers a still scene once its effects fade, so stop repainting under the blur
    // (but repaint after a resize).
    const resized = this.scale.width !== this.drawnSize[0] || this.scale.height !== this.drawnSize[1];
    if (s.phase !== 'over' || performance.now() - s.overAt < OVER_REPAINT_MS || resized) this.draw(s, steps);
  }

  private drawnSize: [number, number] = [0, 0];
  /** Current (eased) camera scale in device px per world unit; 0 = take the target at once. */
  private zoom = 0;

  /**
   * Tells the World how far apart the racers may get before the regroup warp, so it only fires when the
   * minimum zoom can no longer show both. Contract gap: core World hardcodes 480 in keepRacersTogether();
   * this sets an optional `regroupGap` field when the World exposes one.
   */
  private setRegroupGap(world: World, gap: number): void {
    const target = world as World & { regroupGap?: number };
    if ('regroupGap' in target) target.regroupGap = Math.max(480, Math.floor(gap));
  }

  private agePuffs(): void {
    if (!this.puffs.length) return;
    for (const puff of this.puffs) puff.age++;
    this.puffs = this.puffs.filter((puff) => puff.age < puff.life);
  }

  // ---------- Rendering ----------

  /** Same camera rule as drawCanvas in the old main.js. `steps` = fixed steps since the last draw. */
  private draw(s: Session, steps: number): void {
    const world = s.world;
    const width = this.scale.width;
    const height = this.scale.height;
    if (width < MIN_DRAW_PX || height < MIN_DRAW_PX) {
      this.hideLabels();
      return;
    }
    this.drawnSize = [width, height];
    // Keep the full jump height visible and at least 560 units of the track ahead on narrow screens.
    const normal = Math.min(height / H, width / 560);
    const active = world.runners.filter((r) => r.alive);
    const racers = active.length ? active : world.runners;
    const front = Math.max(...racers.map((r) => r.x));
    const back = Math.min(...racers.map((r) => r.x));
    const snap = world.snapCamera;
    // Versus zooms out (down to VERSUS_MIN_ZOOM of the normal scale) so both racers stay on screen.
    let targetScale = normal;
    if (world.versus) {
      const span = front - back + RUNNER_WIDTH + 2 * VERSUS_MARGIN;
      targetScale = Math.max(normal * VERSUS_MIN_ZOOM, Math.min(normal, width / span));
      this.setRegroupGap(world, width / (normal * VERSUS_MIN_ZOOM) - RUNNER_WIDTH - 2 * VERSUS_MARGIN);
    }
    if (snap || !this.zoom || Math.abs(targetScale - this.zoom) > normal * .5) this.zoom = targetScale;
    else this.zoom += (targetScale - this.zoom) * (1 - .8 ** steps);
    const scale = this.zoom;
    const viewWidth = width / scale;
    // The ground stays anchored at the bottom; a zoomed-out view grows upward into the sky.
    const offsetY = height - H * scale;
    let left = front - viewWidth * .42;
    if (world.versus && back - VERSUS_MARGIN < left) left = Math.max(back - VERSUS_MARGIN, front + RUNNER_WIDTH + VERSUS_MARGIN - viewWidth);
    const target = Math.max(0, Math.min(world.dimension.width - viewWidth, left));
    if (snap || Math.abs(target - world.camera) > viewWidth * .6) {
      world.camera = target;
      world.snapCamera = false;
    } else world.camera += (target - world.camera) * (1 - .8 ** steps);

    const reduceMotion = reducedMotion();
    let shakeX = 0;
    let shakeY = 0;
    if (!reduceMotion && world.shake > .05) {
      // The world tick stops after a solo death, so the shake phase follows the effects clock.
      const st = world.fxTick;
      shakeX = Math.sin(st * 2.1) * world.shake * .4;
      shakeY = Math.cos(st) * world.shake * .23;
    }
    placeCamera(this.cameras.main, scale, offsetY, world.camera - shakeX, shakeY);
    this.bg.x = shakeX;
    const viewTop = Math.min(0, -offsetY / scale);
    drawWorld({ bg: this.bg, world: this.layer, overlay: this.overlay }, world, { viewWidth, viewTop, reduceMotion, puffs: this.puffs });
    this.drawLabels(world, viewWidth, scale);
  }

  /** Portal caption and versus name tags as Phaser Text, kept at least 10 CSS px tall. */
  private drawLabels(world: World, viewWidth: number, scale: number): void {
    const list = worldLabels(world, { viewWidth, scale, pixelRatio: pixelRatio(), levelCount: LEVELS.length });
    const resolution = Math.max(1, Math.min(4, scale));
    // Cap the font (world units) so a label never needs a texture bigger than ~MAX_LABEL_CSS_PX on screen.
    const maxSize = (MAX_LABEL_CSS_PX * pixelRatio()) / Math.max(scale, 1e-3);
    while (this.labels.length < list.length) {
      this.labels.push(this.add.text(0, 0, '', { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontStyle: 'bold' }).setOrigin(.5, .82).setDepth(2));
    }
    this.labels.forEach((text, i) => {
      const item = list[i];
      if (!item || !item.text || !Number.isFinite(item.size) || item.size <= 0) { text.setVisible(false); return; }
      const size = `${Math.round(Math.min(item.size, maxSize) * 10) / 10}px`;
      if (text.style.fontSize !== size) text.setFontSize(size);
      if (text.style.color !== item.color) text.setColor(item.color);
      if (text.text !== item.text) text.setText(item.text);
      if (Math.abs(text.style.resolution - resolution) > .01) text.setResolution(resolution);
      text.setPosition(item.x, item.y).setVisible(true);
    });
  }

  private clearLayers(): void {
    if (!this.ready) return;
    this.bg.clear();
    this.layer.clear();
    this.overlay.clear();
    this.hideLabels();
    this.drawnSize = [0, 0];
  }

  private hideLabels(): void {
    for (const text of this.labels) text.setVisible(false);
  }

  /** Drops every bus and DOM listener. createGame calls it when the game is destroyed. */
  dispose(): void {
    clearTimeout(this.blurTimer);
    for (const fn of this.cleanup.splice(0)) fn();
    if (this.session) sound.playMusic(false);
    this.session = null;
    this.ready = false;
  }
}
