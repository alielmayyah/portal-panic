// Monsters and bosses (wave 2). Pure simulation, no DOM or Phaser; world.ts calls the hooks below.
//
// ---------------------------------------------------------------------------------------------
// For level authors (worker L):
//   Monster types: MONSTER_TYPES = ['hopper', 'swooper', 'spitter', 'brute', 'splitter', 'boss'].
//   Build one with makeMonster(type, wx, floor = GROUND_Y, variant = 0, range?) and put it in a level's
//   `hazards` array next to makeHazard(...) entries:
//     hazards: [...hazards(['crystal', 620]), makeMonster('hopper', 900), makeMonster('boss', 3300, 340, 1)]
//   `floor` is the y of the ground (or ledge top) the monster lives on (like makeHazard).
//   hopper   jumps toward the nearest runner in arcs, inside +-range (default 150) of its spawn x.
//   swooper  hovers ~150 above `floor`, then dives in a sine curve at runners. Its lowest point
//            passes over a ducking runner (duck to dodge). range = dive leash (default 260).
//   spitter  static turret; lobs arcing goo at runners within 560. variant 1 = fires faster.
//   brute    patrols +-range (default 130); front-armored: blaster shots from the front bounce off.
//            Hit it from behind (it turns slowly), jump over it, or use a missile.
//   splitter slow blob (+-range, default 80); splits into 2 small hopping blobs when killed.
//   boss     variant 0 = mid boss "Brood Warden Gulvax" (level 4), 1 = final "Rift Tyrant Ozzaroth"
//            (level 8). Place it on the ground about 250-450 before the exit portal; it fights inside
//            [wx - range, wx + w] (range default 420 / 460). While it lives the exit portal is sealed.
//   Keep each leash over solid ground (monsters do not fall into pits).
//
// For weapons (worker S):
//   world.damageObstacle(obstacle, amount, { runner, dir?, kind?, x?, y?, armorPiercing? }) damages any
//   obstacle (walls, drones, slimes, crystals and monsters) and returns 'hit' | 'killed' | 'blocked' |
//   'immune'. `dir` is the travel direction of the projectile (+1 right, -1 left); brutes use it for their
//   front armor (kind 'missile' or armorPiercing ignores it). World.hitObstacle already routes here.
//
// For the HUD (scene worker): bossHud(world) -> { name, hp, maxHp, phase } | null (an awake, living boss);
//   world.boss holds the full BossInfo (also awake/defeated) or null when the level has no boss.
//   portalSealed(world) is true while a boss lives.
//
// Boss events (World events, runner may be null; x/y = boss position) for sound and music:
//   'boss-intro'   the boss wakes (a runner enters its arena, ~640 away, or shoots it).
//   'boss-phase'   phase change; the new phase is on world.boss.phase (and obstacle.mob.phase).
//   'boss-charge'  charge-attack windup starts (the dash follows BOSS_STATS[v].chargeWindup ticks later).
//   'boss-volley'  a projectile volley starts (each orb also sends 'enemy-fire').
//   'boss-summon'  minions spawned.
//   'boss-hurt'    each damaging hit (blocked hits during invulnerability send 'armor-block').
//   'boss-death'   the boss dies (big explosion), immediately followed by
//   'portal-open'  the exit unseals (x/y = portal).
//   world.boss = { name, hp, maxHp, phase, active, awake, defeated, x, killer?, openedAt? } | null; active = fight
//   in progress. killer/openedAt: the runner that landed the killing blow and the world tick the portal opened.
// Other monster events: 'hop', 'swoop', 'spit', 'armor-block' (brute front armor), 'split'.
// ---------------------------------------------------------------------------------------------
import { bossFrozen, isFrozen } from './powers';
import type {
  DeathCause, EnemyShot, Facing, HazardDef, MonsterDeathCause, MonsterType, Obstacle, Runner, WorldEvent, WorldEventType,
} from './types';
import type { World } from './world';

export type { MonsterType } from './types';

export const MONSTER_TYPES = ['hopper', 'swooper', 'spitter', 'brute', 'splitter', 'boss'] as const satisfies readonly MonsterType[];
export const MONSTER_DEATHS = MONSTER_TYPES.map((t) => `${t}-hit` as const) satisfies readonly MonsterDeathCause[];
/** Contact death cause per monster type (merged into world.ts DEATH_BY_HAZARD). */
export const MONSTER_DEATH_BY_TYPE = Object.fromEntries(MONSTER_TYPES.map((t) => [t, `${t}-hit`])) as { [K in MonsterType]: `${K}-hit` };
export const isMonsterType = (type: string): type is MonsterType => (MONSTER_TYPES as readonly string[]).includes(type);
export const isMonster = (o: Pick<Obstacle, 'type'>): boolean => isMonsterType(o.type);

export interface MonsterInfo { name: string; bounty: number; color: string; blurb: string }
export const MONSTERS: Readonly<Record<MonsterType, MonsterInfo>> = {
  hopper: { name: 'Gloop hopper', bounty: 20, color: '#7cf07a', blurb: 'Leaps at you in arcs.' },
  swooper: { name: 'Dusk swooper', bounty: 25, color: '#b48cff', blurb: 'Dives in a curve. Duck under it.' },
  spitter: { name: 'Bile spitter', bounty: 30, color: '#d6e64a', blurb: 'Lobs arcing goo.' },
  brute: { name: 'Plated brute', bounty: 45, color: '#e0894a', blurb: 'Armored front. Hit it from behind or use a missile.' },
  splitter: { name: 'Twin blob', bounty: 20, color: '#ff7ab8', blurb: 'Splits in two when popped.' },
  boss: { name: 'Boss', bounty: 300, color: '#ff4f6d', blurb: 'Seals the portal until it falls.' },
};
export const BOSS_NAMES = ['Brood Warden Gulvax', 'Rift Tyrant Ozzaroth'] as const;
const BOSS_BOUNTY = [300, 800] as const;

/**
 * Boss tuning (index = variant: 0 mid boss, 1 final boss). Measured with the free blaster (4 hits/s);
 * tests/balance-combat.test.ts pins the targets (time to kill, windups, avoidability).
 */
export interface BossStats {
  hp: number;
  /**
   * Body box. The art (creatureBosses.ts) is drawn at a fixed size on the box's bottom centre, so w/h only set
   * the hitbox: hazardBox (5 px inset) then stays inside the drawn carapace/mantle, without the thin crown
   * spikes and horn tips a jumping runner should be able to graze.
   */
  w: number;
  h: number;
  /** Ticks of mouth-open telegraph before the first orb. */
  volleyWindup: number;
  /** Ticks between orbs of a volley. */
  volleyGap: number;
  /** Extra ticks before a high orb that follows a low one, so a runner who jumped has landed and can duck. */
  volleyLand: number;
  /** Orbs per volley = volleyBase + phase. */
  volleyBase: number;
  /** Ticks of charge telegraph before the dash. */
  chargeWindup: number;
  /** Dash speed (world units per tick). */
  dash: number;
  /** Idle cooldown between attacks, per phase (index 1..3). */
  rest: readonly [number, number, number, number];
}
export const BOSS_STATS: readonly [BossStats, BossStats] = [
  { hp: 120, w: 90, h: 90, volleyWindup: 36, volleyGap: 17, volleyLand: 27, volleyBase: 2, chargeWindup: 44, dash: 8.5, rest: [0, 100, 80, 64] },
  { hp: 200, w: 100, h: 108, volleyWindup: 36, volleyGap: 15, volleyLand: 29, volleyBase: 3, chargeWindup: 44, dash: 9.5, rest: [0, 90, 72, 56] },
];
/** Orb height above the boss floor: high orbs (duck under) and low orbs (jump over). */
export const ORB_HIGH = 48;
export const ORB_LOW = 18;
/** Ticks the boss is shielded while it changes phase. */
export const BOSS_PHASE_TICKS = 80;
/** Ticks of hit flash during which further damage is blocked. */
export const BOSS_HIT_INVULN = 6;
/**
 * Shield contact / giant stomp on a boss: damage, and the minimum ticks between two such hits. powers.ts gives
 * a giant exactly one boss stomp per pickup, so `stomp` is the giant's whole boss value (~8% of the final boss);
 * a shield is ~5%. Scale both with BOSS_STATS hp.
 */
export const BOSS_CONTACT_DAMAGE = { shield: 10, stomp: 16 } as const;
export const BOSS_CONTACT_COOLDOWN = 120;
const SMALL_BOUNTY = 8;
/** Splitter children use the splitter type with mob.small. */
export const SMALL_SPLITTER = { w: 28, h: 24, hp: 1 } as const;

const GROUND = 340;
/** Swoopers hover this far above their floor. */
export const SWOOP_HOVER = 150;
/** Lowest swooper point: its hitbox bottom stays this far above the floor (a ducked runner is 30 tall). */
export const SWOOP_CLEARANCE = 34;
/**
 * Versus: a killed monster only comes back when its spawn is at least this far from every other living runner.
 * Wider than the zoomed-out versus view (about 1260 world units ahead at 21:9).
 */
export const OFFSCREEN = 1400;
const DEFAULT_RANGE: Record<MonsterType, number> = { hopper: 150, swooper: 260, spitter: 0, brute: 130, splitter: 80, boss: 420 };

/** Builds one monster definition for level data (see the header). */
export function makeMonster(type: MonsterType, wx: number, floor = GROUND, variant = 0, range?: number): HazardDef {
  const base = { type, wx, phase: wx * .03, variant, range: range ?? DEFAULT_RANGE[type] };
  switch (type) {
    case 'hopper': return { ...base, w: 40, h: 34, y: floor - 34, hp: 2 };
    case 'swooper': return { ...base, w: 44, h: 26, y: floor - SWOOP_HOVER - 26, hp: 1 };
    case 'spitter': return { ...base, w: 44, h: 48, y: floor - 48, hp: 3 };
    case 'brute': return { ...base, w: 58, h: 66, y: floor - 66, hp: 5 };
    case 'splitter': return { ...base, w: 54, h: 46, y: floor - 46, hp: 3 };
    case 'boss': {
      const final = variant ? 1 : 0;
      const { w, h, hp } = BOSS_STATS[final];
      return { ...base, variant: final, range: range ?? (final ? 460 : 420), w, h, y: floor - h, hp };
    }
  }
}

// ---------- Runtime state ----------

export type MobMode =
  | 'idle' | 'air' | 'hover' | 'dive' | 'rise' | 'wind' | 'walk' | 'turn' | 'charge'
  | 'sleep' | 'volley' | 'dash' | 'return' | 'summon' | 'phase';

export interface MobState {
  kind: MonsterType;
  state: MobMode;
  /** Ticks in the current state. */
  t: number;
  cool: number;
  vx: number;
  vy: number;
  air: boolean;
  /** Facing (brute armor faces this way). */
  dir: Facing;
  turnTo: Facing;
  /** y of the floor the monster lives on. */
  home: number;
  /** Leash centre and half-width. */
  anchor: number;
  range: number;
  variant: number;
  /** Splitter child. */
  small: boolean;
  /** Spawned at runtime (splitter children, boss minions); removed on restore. */
  spawned: boolean;
  parent: Obstacle | null;
  /** Ticks during which contact is harmless (fresh spawns). */
  grace: number;
  /** Ticks during which damage is ignored (boss hit and phase flashes). */
  invuln: number;
  /** Ticks since the last landing (squash animation). */
  land: number;
  fromX: number;
  fromY: number;
  toX: number;
  /** Boss: phase 1..3, attack counter, shots fired in the current volley. */
  phase: number;
  attack: number;
  shots: number;
  /** Boss: ticks until shield contact or a giant stomp can damage it again. */
  contactCool: number;
}

export interface BossInfo {
  name: string;
  hp: number;
  maxHp: number;
  phase: number;
  /** Fight in progress: awake and alive (music switches on this). */
  active: boolean;
  awake: boolean;
  defeated: boolean;
  x: number;
  /** The runner whose hit killed the boss (set on 'boss-death'). */
  killer?: Runner;
  /** world.tick at which the boss died and the portal opened. */
  openedAt?: number;
}
/** Who killed a boss and when (kept across the per-step rebuilds of world.boss). */
export interface BossKill { killer: Runner; openedAt: number }
export interface BossHud { name: string; hp: number; maxHp: number; phase: number }

export interface DamageSource {
  runner: Runner;
  /** Travel direction of the projectile (+1 right, -1 left). */
  dir?: number;
  /** 'pulse', 'missile', or a weapon id. Missiles ignore brute armor. */
  kind?: string;
  x?: number;
  y?: number;
  armorPiercing?: boolean;
}
export type DamageResult = 'hit' | 'killed' | 'blocked' | 'immune';

// Per-world bookkeeping that is not part of the public state.
const origins = new WeakMap<Obstacle, HazardDef>();
const pending = new WeakMap<World, Obstacle[]>();
const kills = new WeakMap<Obstacle, BossKill>();

const push = (w: World, type: WorldEventType, runner: Runner | null = null, x?: number, y?: number) => {
  const event: WorldEvent = { type, runner };
  if (x !== undefined) event.x = x;
  if (y !== undefined) event.y = y;
  w.events.push(event);
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
const cx = (o: Obstacle) => o.wx + o.w / 2;
const rx = (r: Runner) => r.x + 22;
const sign = (v: number): Facing => (v < 0 ? -1 : 1);

function freshMob(def: HazardDef, spawned = false, parent: Obstacle | null = null): MobState {
  const kind = def.type as MonsterType;
  const home = def.y + def.h + (kind === 'swooper' ? SWOOP_HOVER : 0);
  return {
    kind, state: kind === 'boss' ? 'sleep' : kind === 'swooper' ? 'hover' : kind === 'brute' || kind === 'splitter' ? 'walk' : 'idle',
    t: 0, cool: 30 + Math.floor((def.phase ?? 0) * 10) % 40, vx: 0, vy: 0, air: false, dir: -1, turnTo: -1,
    home, anchor: def.wx, range: def.range ?? DEFAULT_RANGE[kind], variant: def.variant ?? 0, small: false,
    spawned, parent, grace: 0, invuln: 0, land: 99, fromX: def.wx, fromY: def.y, toX: def.wx, phase: 1, attack: 0, shots: 0, contactCool: 0,
  };
}

function freshObstacle(def: HazardDef, tick: number): Obstacle {
  return { ...def, x: def.wx, baseX: def.wx, baseY: def.y, maxHp: def.hp, charge: 0, readyAt: tick + 70, flash: 0 };
}

/** Resets an obstacle in place to its level-data state (keeps the object identity). */
function resetObstacle(o: Obstacle, def: HazardDef, tick: number): void {
  Object.assign(o, freshObstacle(def, tick));
  o.broken = false;
  delete o.aim;
  delete o.aimY;
  if (isMonsterType(def.type)) o.mob = freshMob(def);
  else delete o.mob;
}

// ---------- World hooks ----------

/** loadLevel hook: remembers each obstacle's level definition and gives monsters their AI state. */
export function initEnemies(w: World): void {
  pending.set(w, []);
  const defs = w.dimension.hazards;
  w.obstacles.forEach((o, i) => {
    const def = defs[i];
    if (def) origins.set(o, def);
    if (isMonsterType(o.type)) o.mob = freshMob(o);
  });
  syncBoss(w);
}

/** Queues a runtime monster (splitter children, boss minions). It joins world.obstacles next step. */
export function spawnMonster(w: World, def: HazardDef, parent: Obstacle | null = null, extra: Partial<MobState> = {}): Obstacle {
  const o = freshObstacle(def, w.tick);
  o.mob = { ...freshMob(def, true, parent), grace: 24, ...extra };
  let queue = pending.get(w);
  if (!queue) { queue = []; pending.set(w, queue); }
  queue.push(o);
  return o;
}

/** True while a living boss seals the exit portal. */
export function portalSealed(w: Pick<World, 'obstacles'>): boolean {
  return w.obstacles.some((o) => o.type === 'boss' && !o.broken);
}

export function bossHud(w: Pick<World, 'boss'>): BossHud | null {
  const b = w.boss;
  if (!b || !b.awake || b.defeated) return null;
  return { name: b.name, hp: b.hp, maxHp: b.maxHp, phase: b.phase };
}

function syncBoss(w: World): void {
  const boss = w.obstacles.find((o) => o.type === 'boss' && !o.mob?.spawned);
  if (!boss) { w.boss = null; return; }
  const m = boss.mob;
  w.boss = {
    name: BOSS_NAMES[m?.variant ? 1 : 0], hp: boss.broken ? 0 : Math.max(0, boss.hp), maxHp: boss.maxHp,
    phase: m?.phase ?? 1, awake: Boolean(m && m.state !== 'sleep'), defeated: Boolean(boss.broken), x: cx(boss),
    active: Boolean(m && m.state !== 'sleep' && !boss.broken),
  };
  const kill = boss.broken ? kills.get(boss) : undefined;
  if (kill) { w.boss.killer = kill.killer; w.boss.openedAt = kill.openedAt; }
}

/** Per-step hook (after the sentries): monster AI, goo splats, spawn queue, boss info. */
export function stepEnemies(w: World): void {
  const queue = pending.get(w);
  if (queue?.length) { w.obstacles.push(...queue); queue.length = 0; }
  if (w.obstacles.some((o) => o.broken && o.mob?.spawned)) w.obstacles = w.obstacles.filter((o) => !(o.broken && o.mob?.spawned));
  const frozen = isFrozen(w);
  // A time freeze holds a boss only briefly (powers.ts bossFrozen); it is a breather, not free hits.
  const bossFree = !frozen || !bossFrozen(w);
  for (const o of w.obstacles) {
    const m = o.mob;
    if (!m || o.broken) continue;
    if (frozen && !(m.kind === 'boss' && bossFree)) {
      // Hit flashes keep counting down while frozen, so a frozen boss takes one hit per flash instead of
      // one hit for the whole freeze; a phase change finishes on time too.
      if (m.invuln) m.invuln--;
      if (m.kind === 'boss' && m.state === 'phase' && ++m.t >= BOSS_PHASE_TICKS) { m.state = 'idle'; m.t = 0; m.cool = 30; }
      continue;
    }
    m.t++;
    if (m.grace) m.grace--;
    if (m.invuln) m.invuln--;
    if (m.contactCool) m.contactCool--;
    if (m.land < 99) m.land++;
    switch (m.kind) {
      case 'hopper': stepHopper(w, o, m); break;
      case 'swooper': stepSwooper(w, o, m); break;
      case 'spitter': stepSpitter(w, o, m); break;
      case 'brute': stepBrute(w, o, m); break;
      case 'splitter': if (m.small) stepHopper(w, o, m); else stepBrute(w, o, m); break;
      case 'boss': stepBoss(w, o, m); break;
    }
  }
  if (!frozen) {
    for (const shot of w.enemyShots) {
      if (shot.style !== 'goo' || shot.life <= 0 || (shot.vy ?? 0) <= 0) continue;
      if (shot.y >= GROUND - 2 || w.dimension.floors.some((f) => shot.x > f.x && shot.x < f.x + f.w && Math.abs(shot.y - f.y) < 6 && f.y < GROUND)) {
        shot.life = 0;
        w.burst(shot.x, Math.min(shot.y, GROUND), 9, MONSTERS.spitter.color, 2.4);
      }
    }
  }
  syncBoss(w);
}

/** Nearest living runner within `range` horizontally (and `rise` vertically of the monster's floor). */
function nearest(w: World, x: number, range: number, home?: number, rise = 200): Runner | null {
  let best: Runner | null = null;
  let gap = range;
  for (const r of w.runners) {
    if (!r.alive) continue;
    const d = Math.abs(rx(r) - x);
    if (d >= range || d > gap) continue;
    // Equal distance (versus runners side by side): alternate by tick instead of always picking runner 0.
    if (best && d === gap && w.tick % 2 === 0) continue;
    if (home !== undefined && Math.abs(r.feet - home) > rise) continue;
    gap = d;
    best = r;
  }
  return best;
}

const HOP_G = .55;

function stepHopper(w: World, o: Obstacle, m: MobState): void {
  const lo = m.anchor - m.range;
  const hi = m.anchor + m.range;
  if (m.air) {
    o.wx = clamp(o.wx + m.vx, lo, hi);
    o.y += m.vy;
    m.vy += HOP_G;
    if (m.vy > 0 && o.y + o.h >= m.home) {
      o.y = m.home - o.h;
      m.air = false;
      m.vx = m.vy = 0;
      m.land = 0;
      m.cool = m.small ? 22 : 38;
    }
    return;
  }
  o.y = m.home - o.h;
  if (m.cool > 0) { m.cool--; return; }
  const target = nearest(w, cx(o), m.small ? 320 : 380, m.home, 180);
  const lift = m.small ? 6.4 : 9.5;
  const T = 2 * lift / HOP_G;
  if (target) {
    m.dir = sign(rx(target) - cx(o));
    const wanted = clamp((rx(target) - cx(o)) / T, -4, 4);
    m.vx = clamp(wanted, (lo - o.wx) / T, (hi - o.wx) / T);
    m.vy = -lift;
    push(w, 'hop', target, cx(o), o.y + o.h);
  } else {
    m.vx = 0;
    m.vy = -lift * .45;
    m.cool = 70;
  }
  m.air = true;
}

function stepSwooper(w: World, o: Obstacle, m: MobState): void {
  const hoverY = m.home - SWOOP_HOVER - o.h;
  const low = m.home - SWOOP_CLEARANCE - o.h;
  const dive = m.variant ? 52 : 64;
  if (m.state === 'hover') {
    o.wx = m.anchor + Math.sin(m.t * .05 + (o.phase ?? 0)) * 6;
    o.y = hoverY + Math.sin(m.t * .09 + (o.phase ?? 0)) * 6;
    if (m.cool > 0) { m.cool--; return; }
    const target = nearest(w, cx(o), 330, m.home, 90);
    if (!target) return;
    m.dir = sign(rx(target) - cx(o));
    m.fromX = o.wx;
    m.fromY = o.y;
    m.toX = clamp(rx(target) + m.dir * 110 - o.w / 2, o.baseX - m.range, o.baseX + m.range);
    m.state = 'dive';
    m.t = 0;
    push(w, 'swoop', target, cx(o), o.y);
    return;
  }
  if (m.state === 'dive') {
    const p = Math.min(1, m.t / dive);
    const curve = Math.sin(p * Math.PI);
    o.wx = m.fromX + (m.toX - m.fromX) * p;
    o.y = m.fromY + (low - m.fromY) * curve + Math.sin(p * Math.PI * 4) * 5 * (1 - curve);
    if (p >= 1) { m.state = 'rise'; m.t = 0; m.anchor = o.wx; }
    return;
  }
  // rise: drift back toward the spawn and the hover height
  m.anchor += clamp(o.baseX - m.anchor, -1.6, 1.6);
  o.wx = m.anchor;
  o.y += clamp(hoverY - o.y, -2.4, 2.4);
  if (Math.abs(o.baseX - m.anchor) < 1 && Math.abs(hoverY - o.y) < 1) { m.state = 'hover'; m.t = 0; m.cool = 70; }
}

const GOO_G = .32;

function stepSpitter(w: World, o: Obstacle, m: MobState): void {
  const x = cx(o);
  if (m.state === 'wind') {
    if (m.t < 26) return;
    m.state = 'idle';
    m.t = 0;
    m.cool = m.variant ? 80 : 115;
    const target = nearest(w, x, 600, m.home, 220);
    if (!target) return;
    m.dir = sign(rx(target) - x);
    const x0 = x + m.dir * 16;
    const y0 = o.y + 10;
    const tx = rx(target) + target.vx * 14;
    const ty = target.feet - 24;
    const T = clamp(36 + Math.abs(tx - x0) * .05, 36, 70);
    const shot: EnemyShot = {
      x: x0, prevX: x0, y: y0, vx: (tx - x0) / T, vy: (ty - y0 - .5 * GOO_G * T * T) / T, gravity: GOO_G,
      life: Math.round(T) + 50, dodged: [], cause: 'spitter-hit', style: 'goo',
    };
    w.enemyShots.push(shot);
    push(w, 'spit', target, x0, y0);
    return;
  }
  if (m.cool > 0) { m.cool--; return; }
  const target = nearest(w, x, 560, m.home, 220);
  if (!target || Math.abs(rx(target) - x) < 60) return;
  m.dir = sign(rx(target) - x);
  m.state = 'wind';
  m.t = 0;
}

/** Brute and big splitter: patrol the leash; the brute charges runners in front and turns slowly. */
function stepBrute(w: World, o: Obstacle, m: MobState): void {
  const brute = m.kind === 'brute';
  const lo = m.anchor - m.range;
  const hi = m.anchor + m.range;
  o.y = m.home - o.h;
  if (m.state === 'turn') {
    if (m.t >= (brute ? 40 : 20)) { m.dir = m.turnTo; m.state = 'walk'; m.t = 0; }
    return;
  }
  const target = brute ? nearest(w, cx(o), 320, m.home, 80) : null;
  if (target) {
    const side = sign(rx(target) - cx(o));
    if (side !== m.dir && Math.abs(rx(target) - cx(o)) < 240) { m.state = 'turn'; m.turnTo = side; m.t = 0; return; }
    if (side === m.dir && Math.abs(rx(target) - cx(o)) < 260) m.state = 'charge';
  } else if (m.state === 'charge') m.state = 'walk';
  const speed = !brute ? .6 : m.state === 'charge' ? 2.4 : 1;
  const next = o.wx + m.dir * speed;
  if (next < lo || next > hi) {
    o.wx = clamp(next, lo, hi);
    // Hold the edge while a runner is in front (keep the armor toward them); otherwise turn around.
    if (target && sign(rx(target) - cx(o)) === m.dir) return;
    m.state = 'turn';
    m.turnTo = (m.dir * -1) as Facing;
    m.t = 0;
    return;
  }
  o.wx = next;
}

// ---------- Boss ----------

const BOSS_WAKE = 640;

function bossPhaseFor(o: Obstacle): number {
  return o.hp > o.maxHp * 2 / 3 ? 1 : o.hp > o.maxHp / 3 ? 2 : 3;
}

function stepBoss(w: World, o: Obstacle, m: MobState): void {
  const left = o.baseX - m.range;
  const right = o.baseX;
  const final = m.variant === 1;
  const stats = BOSS_STATS[final ? 1 : 0];
  o.y = m.home - o.h;
  if (m.state === 'sleep') {
    if (nearest(w, cx(o), BOSS_WAKE)) wakeBoss(w, o, m);
    return;
  }
  const target = nearest(w, cx(o), 2000);
  if (m.state !== 'dash' && target) m.dir = sign(rx(target) - cx(o));
  switch (m.state) {
    case 'phase':
      o.wx += clamp(o.baseX - o.wx, -4, 4);
      if (m.t >= BOSS_PHASE_TICKS) { m.state = 'idle'; m.t = 0; m.cool = 30; }
      return;
    case 'idle': {
      o.wx += clamp(o.baseX - m.range * .25 - o.wx, -.8, .8);
      if (m.cool > 0) { m.cool--; return; }
      const plan: MobMode[] = m.phase === 1 ? (final ? ['volley', 'summon'] : ['volley'])
        : m.phase === 2 ? (final ? ['volley', 'charge', 'summon'] : ['volley', 'charge'])
        : ['volley', 'charge', 'volley', 'summon'];
      m.state = plan[m.attack++ % plan.length]!;
      m.t = 0;
      m.shots = 0;
      if (m.state === 'volley') push(w, 'boss-volley', target, cx(o), o.y);
      if (m.state === 'charge') push(w, 'boss-charge', target, cx(o), o.y + o.h);
      return;
    }
    case 'volley': {
      const count = stats.volleyBase + m.phase;
      if (m.shots < count && m.t === volleyTime(stats, m.shots)) {
        // Alternate high shots (duck under) and low shots (jump over); volleyTime sets the spacing.
        const y = m.home - (m.shots % 2 ? ORB_LOW : ORB_HIGH);
        const x = m.dir > 0 ? o.wx + o.w : o.wx;
        w.enemyShots.push({ x, prevX: x, y, vx: m.dir * orbSpeed(m.phase), life: 170, dodged: [], cause: 'boss-hit', style: 'orb' });
        m.shots++;
        push(w, 'enemy-fire', null, x, y);
      }
      if (m.shots >= count && m.t >= volleyTime(stats, count - 1) + stats.volleyGap) endAttack(m);
      return;
    }
    case 'charge':
      if (m.t >= stats.chargeWindup) {
        m.state = 'dash';
        m.t = 0;
        w.shake = Math.max(w.shake, 8);
      }
      return;
    case 'dash': {
      o.wx = clamp(o.wx + m.dir * stats.dash, left, right);
      if (o.wx <= left || o.wx >= right || m.t > 80) { m.state = 'return'; m.t = 0; w.shake = Math.max(w.shake, 6); }
      return;
    }
    case 'return':
      o.wx += clamp(o.baseX - m.range * .25 - o.wx, -2.6, 2.6);
      if (Math.abs(o.baseX - m.range * .25 - o.wx) < 3) endAttack(m);
      return;
    case 'summon':
      if (m.t === 20) {
        const alive = w.obstacles.filter((x) => x.mob?.parent === o && !x.broken).length;
        if (alive < 3) {
          const front = m.dir > 0 ? o.wx + o.w + 10 : o.wx - 50;
          const kinds: MonsterType[] = final ? ['swooper', 'hopper'] : ['hopper', 'hopper'];
          kinds.forEach((kind, i) => {
            const def = makeMonster(kind, front + i * m.dir * 46, m.home, 0, 140);
            spawnMonster(w, def, o, kind === 'hopper' ? { air: true, vx: m.dir * 2, vy: -7 - i * 2 } : {});
          });
          push(w, 'boss-summon', target, cx(o), o.y);
        }
      }
      if (m.t >= 46) endAttack(m);
      return;
    default:
      endAttack(m);
  }
}

function endAttack(m: MobState): void {
  m.state = 'idle';
  m.t = 0;
  m.cool = BOSS_STATS[m.variant ? 1 : 0].rest[m.phase]!;
}

/** Boss orb speed per phase (world units per tick). */
export const orbSpeed = (phase: number): number => 5.6 + phase * .8;

/**
 * Tick (since the volley started) at which orb `k` fires. Orbs alternate high (even k) and low (odd k),
 * `volleyGap` apart; a high orb after a low one waits `volleyLand` more ticks, so a runner who jumped the low
 * orb has landed (a full jump lasts ~37 ticks) before it must duck. This rules out unavoidable low-high-low chains.
 */
export const volleyTime = (s: Pick<BossStats, 'volleyWindup' | 'volleyGap' | 'volleyLand'>, k: number): number =>
  s.volleyWindup + k * s.volleyGap + Math.floor(k / 2) * s.volleyLand;

function wakeBoss(w: World, o: Obstacle, m: MobState): void {
  if (m.state !== 'sleep') return;
  m.state = 'idle';
  m.t = 0;
  m.cool = 50;
  push(w, 'boss-intro', null, cx(o), o.y);
}

function bossDamaged(w: World, o: Obstacle, m: MobState): void {
  m.invuln = BOSS_HIT_INVULN;
  push(w, 'boss-hurt', null, cx(o), o.y + o.h / 2);
  const phase = bossPhaseFor(o);
  if (phase > m.phase) {
    m.phase = phase;
    m.state = 'phase';
    m.t = 0;
    m.invuln = BOSS_PHASE_TICKS;
    w.shake = Math.max(w.shake, 10);
    // Clear the boss's own shots so a phase change gives a breather.
    w.enemyShots = w.enemyShots.filter((s) => s.cause !== 'boss-hit');
    push(w, 'boss-phase', null, cx(o), o.y);
  }
}

// ---------- Damage and death ----------

/**
 * Damages any obstacle. Weapons call this (through world.damageObstacle). Handles brute front armor,
 * boss invulnerability flashes and phase changes; a lethal hit goes through world.breakObstacle.
 */
export function damageObstacle(w: World, o: Obstacle, amount: number, source: DamageSource): DamageResult {
  if (o.broken) return 'immune';
  const m = o.mob;
  const hitY = source.y ?? o.y + o.h / 2;
  const fromDir = source.dir !== undefined ? -Math.sign(source.dir) : Math.sign((source.x ?? rx(source.runner)) - cx(o));
  if (m?.kind === 'boss') {
    if (m.state === 'sleep') wakeBoss(w, o, m);
    if (m.invuln > 0 || m.state === 'phase') {
      w.burst(fromDir > 0 ? o.wx + o.w - 4 : o.wx + 4, hitY, 5, '#ffffff', 2.4);
      push(w, 'armor-block', source.runner, cx(o), hitY);
      return 'blocked';
    }
  }
  if (m?.kind === 'brute' && fromDir === m.dir && source.kind !== 'missile' && !source.armorPiercing) {
    w.burst(m.dir > 0 ? o.wx + o.w - 3 : o.wx + 3, hitY, 8, '#ffe9a8', 3.2);
    o.flash = Math.max(o.flash, 3);
    push(w, 'armor-block', source.runner, cx(o), hitY);
    return 'blocked';
  }
  o.hp = (o.hp ?? 1) - amount;
  if (o.hp <= 0) { w.breakObstacle(o, source.runner); return 'killed'; }
  o.flash = 9;
  const x = fromDir < 0 ? o.wx + 3 : o.wx + o.w - 3;
  w.burst(x, hitY, 7, o.type === 'wall' ? '#ffe18a' : '#bcfece', 3.6);
  push(w, 'target-hit', source.runner);
  if (m?.kind === 'boss') bossDamaged(w, o, m);
  return 'hit';
}

/**
 * breakObstacle hook (called first). Returns true when the break must not happen: a boss hit by a
 * non-lethal break (shield contact, giant stomp) takes damage instead. Otherwise it adds monster bounties,
 * splits splitters, and sets off the boss death explosion, then lets world.breakObstacle finish.
 */
export function onBreakObstacle(w: World, o: Obstacle, runner: Runner, shield: boolean): boolean {
  const m = o.mob;
  if (!m) return false;
  if (m.kind === 'boss' && o.hp > 0) {
    // Shield contact or a giant stomp: heavy damage and a knockback, never an instant kill. A giant touches
    // the boss again every few ticks, so contact damage has its own cooldown (else giant melts a boss).
    if (m.state === 'sleep') wakeBoss(w, o, m);
    const away = sign(rx(runner) - cx(o));
    runner.x = clamp(runner.x + away * 60, 12, w.dimension.width - 52);
    runner.invuln = Math.max(runner.invuln, 50);
    if (m.invuln > 0 || m.state === 'phase' || m.contactCool > 0) return true;
    m.contactCool = BOSS_CONTACT_COOLDOWN;
    o.hp -= shield ? BOSS_CONTACT_DAMAGE.shield : BOSS_CONTACT_DAMAGE.stomp;
    if (o.hp > 0) {
      o.flash = 9;
      w.burst(cx(o), o.y + o.h / 2, 14, '#ffffff', 4);
      push(w, 'target-hit', runner);
      bossDamaged(w, o, m);
      return true;
    }
  }
  if (!shield) runner.bonus += (m.kind === 'boss' ? BOSS_BOUNTY[m.variant ? 1 : 0] : m.small ? SMALL_BOUNTY : MONSTERS[m.kind].bounty) - 12;
  if (m.kind === 'splitter' && !m.small) splitBlob(w, o, m);
  if (m.kind === 'boss') bossExplosion(w, o, m, runner);
  return false;
}

function splitBlob(w: World, o: Obstacle, m: MobState): void {
  for (const side of [-1, 1] as const) {
    const def: HazardDef = {
      type: 'splitter', wx: cx(o) - SMALL_SPLITTER.w / 2 + side * 10, y: m.home - SMALL_SPLITTER.h,
      w: SMALL_SPLITTER.w, h: SMALL_SPLITTER.h, hp: SMALL_SPLITTER.hp, phase: (o.phase ?? 0) + side, range: 110,
    };
    spawnMonster(w, def, o, { small: true, air: true, vx: side * 2.6, vy: -6.5, dir: side, state: 'idle', anchor: def.wx, grace: 30 });
  }
  push(w, 'split', null, cx(o), o.y + o.h / 2);
}

function bossExplosion(w: World, o: Obstacle, m: MobState, runner: Runner): void {
  const x = cx(o);
  const y = o.y + o.h / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    w.blasts.push({ x: x + Math.cos(a) * o.w * .45, y: y + Math.sin(a) * o.h * .4, color: i % 2 ? '#ffd36b' : MONSTERS.boss.color, life: 22 + i * 3 });
    w.burst(x + Math.cos(a) * 30, y + Math.sin(a) * 30, 16, i % 2 ? '#fff2b0' : '#ff8a5c', 7);
  }
  w.burst(x, y, 60, '#ffffff', 9);
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    w.debris.push({ x: x + side * Math.random() * 30, y: y + (Math.random() - .5) * o.h * .6, vx: side * (2 + Math.random() * 5),
      vy: -4 - Math.random() * 7, angle: 0, spin: side * (.05 + Math.random() * .2), life: 60 });
  }
  w.shake = Math.max(w.shake, 24);
  w.flash = Math.max(w.flash, .8);
  w.riftFlash = Math.max(w.riftFlash, .6);
  // Minions die with their master; boss shots fizzle.
  for (const minion of w.obstacles) {
    if (minion.mob?.parent !== o || minion.broken) continue;
    minion.broken = true;
    w.burst(cx(minion), minion.y + minion.h / 2, 14, '#ffb172', 4);
  }
  for (const queued of pending.get(w) ?? []) queued.broken = true;
  w.enemyShots = w.enemyShots.filter((s) => s.cause !== 'boss-hit');
  m.state = 'idle';
  kills.set(o, { killer: runner, openedAt: w.tick });
  push(w, 'boss-death', runner, x, y);
  push(w, 'portal-open', runner, w.dimension.exit, 244);
}

// ---------- Checkpoint restore ----------

/**
 * respawn hook: puts killed monsters (every non-wall obstacle from level data) back in their initial state
 * and clears enemy shots. Solo: everything is reset (a living boss heals to full; a defeated boss stays
 * down) and runtime spawns are removed. Versus: only killed monsters whose spawn is off-screen for every
 * other living runner come back, the boss is left alone, and only shots near the respawn point are cleared.
 */
export function restoreMonsters(w: World, runner: Runner): void {
  const others = w.runners.filter((r) => r !== runner && r.alive);
  const offscreen = (x: number) => others.every((r) => Math.abs(x - rx(r)) > OFFSCREEN);
  const restored = new Set<Obstacle>();
  for (const o of w.obstacles) {
    const def = origins.get(o);
    if (!def || o.type === 'wall') continue;
    if (!w.versus) {
      if (o.type === 'boss' && o.broken) continue;
      resetObstacle(o, def, w.tick);
      restored.add(o);
      continue;
    }
    if (!o.broken || o.type === 'boss' || !offscreen(def.wx + def.w / 2)) continue;
    // A splitter comes back only when none of its children are still around on someone's screen.
    const kids = w.obstacles.filter((k) => k.mob?.parent === o && !k.broken);
    if (kids.some((k) => !offscreen(cx(k)))) continue;
    resetObstacle(o, def, w.tick);
    restored.add(o);
  }
  w.obstacles = w.obstacles.filter((o) => !(o.mob?.spawned && (!w.versus || o.broken || (o.mob.parent && restored.has(o.mob.parent)))));
  const queue = pending.get(w);
  if (queue && !w.versus) queue.length = 0;
  const spawnX = rx(runner);
  w.enemyShots = w.versus ? w.enemyShots.filter((s) => Math.abs(s.x - spawnX) > 700) : [];
  syncBoss(w);
}

/** Death cause for a monster contact (used by world.ts). */
export const monsterDeath = (type: MonsterType): DeathCause => MONSTER_DEATH_BY_TYPE[type];
