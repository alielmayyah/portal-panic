// Superpowers: timed power-ups a runner collects as pickups (besides the shield and boots gadgets).
//
// ---------------------------------------------------------------------------------------------
// For level authors (worker L):
//   Power kinds: POWER_KINDS = ['turbo', 'magnet', 'freeze', 'ghost', 'rapid', 'giant'].
//   PickupKind includes PowerKind, so declare a power pickup with the existing level helper:
//     makePickup(1820, 220, 'turbo')      // or in a pickups(...) list: [1820, 220, 'giant']
//   Power pickups get the gadget radius (14). Place them above ground reach like shield/boots.
//
// For monster code (worker E), read these generic hooks instead of hard-coding powers:
//   isFrozen(world)                 time freeze active: skip monster movement, AI, attack timers and
//                                   enemy-shot motion (they hang in the air). Contact still counts.
//   enemyClock(world)               world.tick minus frozen time: drive sin() patrols from this so
//                                   monsters resume smoothly after a freeze.
//   monsterContact(world, r, box)   call BEFORE a runner-vs-monster lethal check, with the monster's
//                                   hitbox. Returns 'pass' (ghost: no contact, skip), 'stomp' (giant:
//                                   kill the monster yourself with your normal death/score path, then
//                                   skip; the 'stomp' event, burst and shake are already done), or null
//                                   (no power applies: run your usual check).
//   shotImmune(r)                   ghost or giant: enemy shots (yours too) cannot hurt this runner.
//   powerHitbox(r, box)             the runner's contact box widened for giant (2x), for your overlap.
//   hasPower(r, kind) / powerTicks(r, kind)   raw per-runner flags.
//
// For the scene / HUD (scene worker): powerStatus(r) returns HUD text such as "Turbo 6s · Ghost 2s"
// ('' when none); withPowerStatus(gadget, r) appends it to the existing gadget string.
// POWER_EVENT_SOUNDS maps the power world events to effect names in src/audio/sound.ts.
// POWERS[kind] has { name, color, ticks, blurb } for toasts.
//
// For weapons (worker S): rapid fire halves cooldowns by ticking r.blasterCooldown and
// r.missileCooldown down twice per step; for other cooldown fields use cooldownScale(r) (0.5 or 1).
// Magnet pulls any world.orbs pickup whose kind is in MAGNET_KINDS ('cell', 'coin').
// Coin drops kept outside world.orbs: call magnetPull(world, drop) for each drop every step.
// ---------------------------------------------------------------------------------------------
//
// State: each runner carries r.powers = { [kind]: ticksLeft }. Timed powers end on death and on
// loadLevel (so a respawn starts clean). This module only imports types, so world.ts can import it
// without a runtime cycle.
import type { Obstacle, PowerKind, Runner, WorldEvent, WorldEventType } from './types';

export type { PowerKind } from './types';

export const POWER_KINDS = ['turbo', 'magnet', 'freeze', 'ghost', 'rapid', 'giant'] as const satisfies readonly PowerKind[];

export interface PowerInfo {
  name: string;
  /** Pickup, aura and HUD colour. */
  color: string;
  /** Duration in 60 Hz ticks. */
  ticks: number;
  /** One-line toast text. */
  blurb: string;
}

export const POWERS: Readonly<Record<PowerKind, PowerInfo>> = {
  turbo: { name: 'Turbo', color: '#ff9f3d', ticks: 8 * 60, blurb: 'faster runs, higher jumps' },
  magnet: { name: 'Magnet', color: '#ff5fa2', ticks: 10 * 60, blurb: 'pulls in cells and coins' },
  freeze: { name: 'Time freeze', color: '#9fd8ff', ticks: 5 * 60, blurb: 'enemies and their shots stop' },
  ghost: { name: 'Ghost', color: '#c9c3ff', ticks: 4 * 60, blurb: 'pass through hazards' },
  // 7 s (was 10): at 10 s a full-uptime blaster removed every one of the final boss's 48 HP.
  rapid: { name: 'Rapid fire', color: '#ffe45c', ticks: 7 * 60, blurb: 'cooldowns halved' },
  giant: { name: 'Giant', color: '#7dff8a', ticks: 6 * 60, blurb: 'double size, stomp monsters' },
};

/** Turbo multipliers. */
export const TURBO_SPEED = 1.4;
/** Versus turbo is milder and shorter so a pickup does not decide the race. */
export const TURBO_SPEED_VERSUS = 1.25;
export const TURBO_TICKS_VERSUS = 6 * 60;
export const TURBO_JUMP = 1.15;
/** Giant scale (drawing and contact box). */
export const GIANT_SCALE = 2;
/** Magnet reach (world units from the runner centre) and pull speed per tick. */
export const MAGNET_RANGE = 260;
export const MAGNET_PULL = 7;
export const MAGNET_KINDS: ReadonlySet<string> = new Set(['cell', 'coin']);
/** Invulnerability granted when ghost or giant ends, so the runner is not killed by what it was inside. */
export const POWER_END_GRACE = 30;
/**
 * Longest stretch of one time freeze that should hold a boss (ticks). enemies.ts can read bossFrozen(w)
 * instead of isFrozen(w) for the boss so a freeze is a breather, not 5 s of free hits.
 */
export const BOSS_FREEZE_TICKS = 120;

/** Events this module adds to the World event stream. */
export const POWER_EVENTS = [...POWER_KINDS, 'stomp', 'power-end'] as const satisfies readonly WorldEventType[];

/** Effect names in src/audio/sound.ts for each power event (pickup sounds, stomp, power end). */
export const POWER_EVENT_SOUNDS = {
  turbo: 'powerTurbo', magnet: 'powerMagnet', freeze: 'powerFreeze', ghost: 'powerGhost', rapid: 'powerRapid',
  giant: 'powerGiant', stomp: 'stomp', 'power-end': 'powerEnd',
} as const satisfies Record<(typeof POWER_EVENTS)[number], string>;

export const isPowerKind = (kind: string): kind is PowerKind => (POWER_KINDS as readonly string[]).includes(kind);

interface Box { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The part of World this module reads and writes (structural, so World satisfies it without an import). */
export interface PowerWorld {
  runners: Runner[];
  events: WorldEvent[];
  orbs: { wx: number; y: number; kind: string; taken?: boolean }[];
  shake: number;
  tick: number;
  /** Two-racer mode (World.versus); some powers are milder there. */
  versus?: boolean;
  burst(x: number, y: number, count: number, color: string, power: number): void;
  /** Used by giant stomps on level hazards. */
  breakObstacle(obstacle: Obstacle, runner: Runner): void;
}

const push = (w: PowerWorld, type: WorldEventType, runner: Runner | null, x?: number, y?: number) => {
  const event: WorldEvent = { type, runner };
  if (x !== undefined) event.x = x;
  if (y !== undefined) event.y = y;
  w.events.push(event);
};

// ---------- Queries ----------

export const powerTicks = (r: Pick<Runner, 'powers'>, kind: PowerKind): number => r.powers?.[kind] ?? 0;
export const hasPower = (r: Pick<Runner, 'powers'>, kind: PowerKind): boolean => powerTicks(r, kind) > 0;
/** Active powers, in POWER_KINDS order. */
export const activePowers = (r: Pick<Runner, 'powers'>): PowerKind[] => POWER_KINDS.filter((k) => hasPower(r, k));

/** Time freeze: true while any living runner holds 'freeze'. Monsters, sentries and enemy shots stop. */
export const isFrozen = (w: Pick<PowerWorld, 'runners'>): boolean => w.runners.some((r) => r.alive && hasPower(r, 'freeze'));
export const isTimeFrozen = isFrozen;
export const isGhost = (r: Pick<Runner, 'powers'>): boolean => hasPower(r, 'ghost');
export const isGiant = (r: Pick<Runner, 'powers'>): boolean => hasPower(r, 'giant');
/** Enemy shots pass through (ghost) or bounce off (giant). */
export const shotImmune = (r: Pick<Runner, 'powers'>): boolean => isGhost(r) || isGiant(r);
/** Horizontal run speed multiplier. */
export const speedScale = (r: Pick<Runner, 'powers'>, versus = false): number =>
  (hasPower(r, 'turbo') ? (versus ? TURBO_SPEED_VERSUS : TURBO_SPEED) : 1);
/** Jump velocity multiplier. */
export const jumpScale = (r: Pick<Runner, 'powers'>): number => (hasPower(r, 'turbo') ? TURBO_JUMP : 1);
/** Weapon cooldown multiplier (rapid fire). */
export const cooldownScale = (r: Pick<Runner, 'powers'>): number => (hasPower(r, 'rapid') ? .5 : 1);
/** Drawing scale around the feet. */
export const runnerScale = (r: Pick<Runner, 'powers'>): number => (isGiant(r) ? GIANT_SCALE : 1);

/** The runner's contact box, scaled up around the feet centre while giant. */
export function powerHitbox(r: Pick<Runner, 'powers'>, box: Box): Box {
  if (!isGiant(r)) return box;
  const cx = box.x + box.w / 2;
  const bottom = box.y + box.h;
  const w = box.w * GIANT_SCALE, h = box.h * GIANT_SCALE;
  return { x: cx - w / 2, y: bottom - h, w, h };
}

/**
 * Generic runner-vs-monster contact rule. `box` is the monster's lethal box, `runnerBox` the runner's
 * normal box. 'pass': ghost, ignore the contact. 'stomp': giant touched it (event, burst and shake done;
 * the caller kills the monster). null: no power applies, run the normal lethal check.
 */
export function monsterContact(w: PowerWorld, r: Runner, box: Box, runnerBox?: Box): 'pass' | 'stomp' | null {
  if (isGhost(r)) return 'pass';
  if (!isGiant(r)) return null;
  const mine = powerHitbox(r, runnerBox ?? { x: r.x + 7, y: r.feet - 58, w: 31, h: 56 });
  if (!overlaps(mine, box)) return 'pass';
  stompFx(w, r, box.x + box.w / 2, box.y + box.h / 2);
  return 'stomp';
}

function stompFx(w: PowerWorld, r: Runner, x: number, y: number): void {
  w.burst(x, y, 18, POWERS.giant.color, 5);
  w.shake = Math.max(w.shake, 9);
  push(w, 'stomp', r, x, y);
}

// ---------- World hooks (called from world.ts) ----------

/** Pickup hook: grants (or refreshes) a power. */
export function grantPower(w: PowerWorld, r: Runner, kind: PowerKind, x?: number, y?: number): void {
  r.powers ??= {};
  r.powers[kind] = kind === 'turbo' && w.versus ? TURBO_TICKS_VERSUS : POWERS[kind].ticks;
  push(w, kind, r, x, y);
  if (x !== undefined && y !== undefined) w.burst(x, y, 20, POWERS[kind].color, 3.4);
}

/** Clears every timed power (death, level load). */
export function clearPowers(r: Runner): void {
  if (r.powers) r.powers = {};
}

/** Per-tick hook at the start of World.stepRunner: timers, rapid-fire cooldowns, magnet pull. */
export function tickPowers(w: PowerWorld, r: Runner): void {
  const p = r.powers;
  if (!p) return;
  if ((p.rapid ?? 0) > 0) {
    // One extra tick off each cooldown: halves them without touching the weapon code.
    if (r.blasterCooldown > 1) r.blasterCooldown--;
    if (r.missileCooldown > 1) r.missileCooldown--;
  }
  if ((p.magnet ?? 0) > 0) pullPickups(w, r);
  for (const kind of POWER_KINDS) {
    const left = p[kind];
    if (!left) continue;
    p[kind] = left - 1;
    if (left - 1 > 0) continue;
    delete p[kind];
    if (kind === 'ghost' || kind === 'giant') r.invuln = Math.max(r.invuln, POWER_END_GRACE);
    push(w, 'power-end', r);
  }
}

/**
 * Generic magnet for items kept outside world.orbs (e.g. weapons.ts coin drops): moves `item` toward the
 * nearest living runner holding 'magnet' within MAGNET_RANGE. Returns true when it was pulled. Call once
 * per item per step.
 */
export function magnetPull(w: Pick<PowerWorld, 'runners'>, item: { x: number; y: number }): boolean {
  let best: Runner | null = null;
  let bestD = MAGNET_RANGE;
  for (const r of w.runners) {
    if (!r.alive || !hasPower(r, 'magnet')) continue;
    const d = Math.hypot(r.x + 22 - item.x, r.feet - 30 - item.y);
    if (d <= bestD) { best = r; bestD = d; }
  }
  if (!best || bestD < 1) return false;
  const step = Math.min(bestD, MAGNET_PULL);
  item.x += ((best.x + 22 - item.x) / bestD) * step;
  item.y += ((best.feet - 30 - item.y) / bestD) * step;
  return true;
}

function pullPickups(w: PowerWorld, r: Runner): void {
  const cx = r.x + 22, cy = r.feet - 30;
  for (const orb of w.orbs) {
    if (orb.taken || !MAGNET_KINDS.has(orb.kind)) continue;
    const dx = cx - orb.wx, dy = cy - orb.y;
    const d = Math.hypot(dx, dy);
    if (d > MAGNET_RANGE || d < 1) continue;
    const step = Math.min(d, MAGNET_PULL);
    orb.wx += (dx / d) * step;
    orb.y += (dy / d) * step;
  }
}

// Ticks spent in time freeze this level, per world (kept here so World needs no new field).
const frozenTicks = new WeakMap<object, number>();

// Ticks the current time freeze has lasted (cleared when it ends).
const freezeRun = new WeakMap<object, number>();

/** Level load hook: resets the freeze clock. */
export function resetWorldPowers(w: object): void { frozenTicks.delete(w); freezeRun.delete(w); }

/** Time freeze for bosses: true only for the first BOSS_FREEZE_TICKS of a freeze. */
export const bossFrozen = (w: Pick<PowerWorld, 'runners'>): boolean => isFrozen(w) && (freezeRun.get(w) ?? 0) <= BOSS_FREEZE_TICKS;

/**
 * Per-step world hook (once per World.step). Returns isFrozen(w) and, while frozen, advances the
 * frozen-time counter so enemyClock stands still.
 */
export function stepWorldPowers(w: Pick<PowerWorld, 'runners'>): boolean {
  if (!isFrozen(w)) { freezeRun.delete(w); return false; }
  frozenTicks.set(w, (frozenTicks.get(w) ?? 0) + 1);
  freezeRun.set(w, (freezeRun.get(w) ?? 0) + 1);
  return true;
}

/**
 * The tick enemies animate by: world.tick minus the time spent frozen, so patrols resume where they
 * stopped instead of jumping. Monster code that drives motion from world.tick should use this.
 */
export const enemyClock = (w: Pick<PowerWorld, 'tick'>): number => w.tick - (frozenTicks.get(w) ?? 0);

/**
 * Hazard contact hook in World.collide, before the lethal check. Returns true when the hazard must be
 * skipped: ghost passes through it; giant stomps it (world.breakObstacle) when the enlarged box touches it.
 */
export function hazardContact(w: PowerWorld, r: Runner, o: Obstacle, runnerBox: Box): boolean {
  if (o.type === 'boss' && (isGhost(r) || isGiant(r))) return bossContact(w, r, o, runnerBox);
  if (isGhost(r)) return true;
  if (!isGiant(r)) return false;
  // Stomps use the hazard's full box (generous for crystals): the giant crushes anything it touches.
  if (overlaps(powerHitbox(r, runnerBox), { x: o.wx, y: o.y, w: o.w, h: o.h })) {
    w.breakObstacle(o, r);
    stompFx(w, r, o.wx + o.w / 2, o.y + o.h / 2);
  }
  return true;
}

/**
 * Ghost or giant touching a boss. Always skips the lethal check. A ghost cannot pass through a boss (it is
 * shoved out of the body, no harm done); a giant gets one stomp, which knocks it back to normal size.
 * Without this a 4 s ghost could stand inside the boss for a whole phase, and a 6 s giant stomped even the
 * final boss to death.
 */
function bossContact(w: PowerWorld, r: Runner, o: Obstacle, runnerBox: Box): boolean {
  const body = { x: o.wx, y: o.y, w: o.w, h: o.h };
  if (isGiant(r)) {
    if (!overlaps(powerHitbox(r, runnerBox), body)) return true;
    // One stomp (enemies.ts turns it into damage and a knockback), then the giant shrinks back.
    w.breakObstacle(o, r);
    stompFx(w, r, o.wx + o.w / 2, o.y + o.h / 2);
    delete r.powers!.giant;
    r.invuln = Math.max(r.invuln, POWER_END_GRACE);
    push(w, 'power-end', r);
    return true;
  }
  if (!overlaps(runnerBox, body)) return true;
  // Shove the ghost out of the boss on the nearer side.
  const offset = runnerBox.x - r.x;
  const left = runnerBox.x + runnerBox.w / 2 < o.wx + o.w / 2;
  r.x = Math.max(12, left ? o.wx - runnerBox.w - offset : o.wx + o.w - offset);
  r.vx = 0;
  return true;
}

// ---------- HUD ----------

const LABELS: Record<PowerKind, string> = {
  turbo: 'Turbo', magnet: 'Magnet', freeze: 'Freeze', ghost: 'Ghost', rapid: 'Rapid', giant: 'Giant',
};

/** HUD status for active powers, e.g. "Turbo 6s · Ghost 2s"; '' when none (or the runner is down). */
export function powerStatus(r: Pick<Runner, 'powers' | 'alive'>): string {
  if (!r.alive) return '';
  return activePowers(r).map((k) => `${LABELS[k]} ${Math.ceil(powerTicks(r, k) / 60)}s`).join(' · ');
}

/** Appends powerStatus to an existing gadget status string. */
export function withPowerStatus(gadget: string, r: Pick<Runner, 'powers' | 'alive'>): string {
  const powers = powerStatus(r);
  return gadget && powers ? `${gadget} · ${powers}` : gadget || powers;
}
