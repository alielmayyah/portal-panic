// Weapons beyond the default blaster, run coins and coin drops. Pure simulation like world.ts: no DOM, no Phaser.
// World calls the hooks below (fireWeapon, stepWeapons, weaponsOnLevel, weaponsOnRespawn, weaponsOnBreak,
// weaponsOnPickup). State lives in WeakMaps keyed by the World and Runner objects, so the World class only
// needs those hook calls. This module only imports types from world.ts (no runtime import cycle).
import { GROUND_Y } from './levels';
import { type DamageResult, damageObstacle } from './enemies';
import type { Facing, Obstacle, Pickup, Runner, Surface, WorldEvent, WorldEventType } from './types';
import type { World } from './world';

// ---------- Weapon table ----------

export type WeaponId = 'blaster' | 'scatter' | 'lance' | 'ricochet' | 'seeker' | 'ember' | 'nova';
export type WeaponKind = 'pulse' | 'spread' | 'beam' | 'bounce' | 'homing' | 'flame' | 'charge';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** One line for the shop card. */
  blurb: string;
  kind: WeaponKind;
  /** Coins (0 = owned from the start). */
  price: number;
  /** Ticks between shots (60 ticks = 1 s). Charge cannon: cooldown after a release. */
  cooldown: number;
  /** Damage per hit (flame: per flame lick; charge: at full charge). */
  damage: number;
  /** Reach in world units. */
  range: number;
  /** Main projectile colour (drawing and the shop swatch). */
  color: string;
  /** Second colour (core / glow). */
  glow: string;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  blaster: { id: 'blaster', name: 'Pocket Blaster', blurb: 'The trusty garage pulse pistol.', kind: 'pulse', price: 0, cooldown: 15, damage: 1, range: 320, color: '#dfff78', glow: '#ffffff' },
  scatter: { id: 'scatter', name: 'Scatter Fan', blurb: 'Three pellets in a fan. Great at close range.', kind: 'spread', price: 120, cooldown: 24, damage: 1, range: 250, color: '#ffb35c', glow: '#fff0c4' },
  ricochet: { id: 'ricochet', name: 'Ricochet Orb', blurb: 'A plasma ball that bounces along the ground.', kind: 'bounce', price: 180, cooldown: 30, damage: 2, range: 460, color: '#7ff7d0', glow: '#e8fff7' },
  ember: { id: 'ember', name: 'Ember Hose', blurb: 'Hold for a short, continuous jet of flame.', kind: 'flame', price: 200, cooldown: 3, damage: .34, range: 135, color: '#ff7a3d', glow: '#ffe07a' },
  lance: { id: 'lance', name: 'Prism Lance', blurb: 'Instant beam that pierces every monster in line.', kind: 'beam', price: 240, cooldown: 36, damage: 2, range: 430, color: '#ff5fd2', glow: '#ffe6fb' },
  seeker: { id: 'seeker', name: 'Hornet Pods', blurb: 'Two seekers that steer into the nearest monster.', kind: 'homing', price: 280, cooldown: 42, damage: 1, range: 420, color: '#b18cff', glow: '#f0e6ff' },
  nova: { id: 'nova', name: 'Nova Cannon', blurb: 'Hold to charge, release to fire. Full charge pierces.', kind: 'charge', price: 340, cooldown: 26, damage: 6, range: 500, color: '#6fc8ff', glow: '#e4f6ff' },
};

/** Shop order. */
export const WEAPON_IDS: readonly WeaponId[] = ['blaster', 'scatter', 'ricochet', 'ember', 'lance', 'seeker', 'nova'];
export const isWeaponId = (value: unknown): value is WeaponId => typeof value === 'string' && value in WEAPONS;

/** Ticks to a full Nova charge. */
export const CHARGE_TICKS = 60;
/** Missile capacity without upgrades (world.ts MAX_MISSILES). */
export const BASE_MAX_MISSILES = 5;
export const MAX_MISSILE_CAP = 8;

/** Coins earned during a run. */
export const COIN_VALUES = { cell: 1, kill: 1, wall: 1, drop: 3, boss: 30, clearBase: 10, clearPerLevel: 5 } as const;

/** What a runner brings into a run (from the shop state). */
export interface Loadout {
  /** Owned weapons in swap order; always includes 'blaster'. */
  weapons: WeaponId[];
  equipped: WeaponId;
  /** Missile capacity (5..8). */
  maxMissiles: number;
  /** Start every level with a phase shield. */
  startShield: boolean;
}

export const DEFAULT_LOADOUT: Readonly<Loadout> = { weapons: ['blaster'], equipped: 'blaster', maxMissiles: BASE_MAX_MISSILES, startShield: false };

// ---------- Runtime state ----------

export interface WeaponShot {
  weapon: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks left. */
  life: number;
  maxLife: number;
  damage: number;
  /** Radius in world units. */
  size: number;
  /** Passes through monsters (never walls). */
  pierce: boolean;
  /** Ignores brute front armor (full Nova charge). */
  armorPiercing: boolean;
  /** Bounce shots: bounces left. */
  bounces: number;
  runner: Runner;
  /** Monsters already hit by a piercing shot. */
  hit: Obstacle[];
  target?: Obstacle;
}

export interface Beam { x1: number; x2: number; y: number; life: number; max: number; color: string; glow: string; runner: Runner }

export interface CoinDrop { x: number; y: number; vx: number; vy: number; value: number; life: number; grounded: boolean; spin: number }

interface Arms {
  loadout: Loadout;
  /** Index into loadout.weapons. */
  slot: number;
  /** Nova charge ticks. */
  charge: number;
  prevSwap: boolean;
  /** Ember: ticks of continuous firing (sound pacing). */
  flaming: number;
  /** Coins earned since the last bank. */
  coins: number;
}

interface WeaponWorld {
  shots: WeaponShot[];
  beams: Beam[];
  drops: CoinDrop[];
  /** Level the state was last reset for (-1 = never). */
  level: number;
  /** A real run (equipRun was called): coins count and loadouts apply. The menu preview stays unarmed. */
  armed: boolean;
  /** Level whose clear bonus was already credited. */
  clearedLevel: number;
}

const worlds = new WeakMap<object, WeaponWorld>();
const arms = new WeakMap<Runner, Arms>();

function stateOf(world: object): WeaponWorld {
  let s = worlds.get(world);
  if (!s) worlds.set(world, (s = { shots: [], beams: [], drops: [], level: -1, armed: false, clearedLevel: -1 }));
  return s;
}

function armsOf(r: Runner): Arms {
  let a = arms.get(r);
  if (!a) arms.set(r, (a = { loadout: { ...DEFAULT_LOADOUT, weapons: [...DEFAULT_LOADOUT.weapons] }, slot: 0, charge: 0, prevSwap: false, flaming: 0, coins: 0 }));
  return a;
}

const push = (world: World, type: WorldEventType, runner: Runner | null, x?: number, y?: number): void => {
  const event: WorldEvent = { type, runner };
  if (x !== undefined) event.x = x;
  if (y !== undefined) event.y = y;
  world.events.push(event);
};

// ---------- Read-only views (renderer, HUD, other features) ----------

export interface WeaponsView {
  readonly shots: readonly WeaponShot[];
  readonly beams: readonly Beam[];
  readonly drops: readonly CoinDrop[];
}

/** Shots, beams and coin drops of a world (any object works; an unknown one reads as empty). */
export function weaponsView(world: object): WeaponsView {
  return worlds.get(world) ?? { shots: [], beams: [], drops: [] };
}

/** Coin drops on the course (mutable, e.g. for a magnet power to pull them). */
export const coinDrops = (world: World): CoinDrop[] => stateOf(world).drops;

/** The weapon a runner is holding. */
export function currentWeapon(r: Runner): WeaponDef {
  const a = arms.get(r);
  return WEAPONS[a?.loadout.weapons[a.slot] ?? 'blaster'];
}

/** 0..1 Nova charge (0 when not charging). */
export const chargeLevel = (r: Runner): number => Math.min(1, (arms.get(r)?.charge ?? 0) / CHARGE_TICKS);

/** Coins this runner earned since the last bank. */
export const runCoins = (r: Runner): number => arms.get(r)?.coins ?? 0;

export const loadoutOf = (r: Runner): Readonly<Loadout> => armsOf(r).loadout;

// ---------- Run setup and banking ----------

/**
 * Marks `world` as a real run and gives each runner its loadout (by runner index). Call right after
 * `new World(...)`. Applies level-start upgrades (missile capacity, starting shield) to the current level.
 */
export function equipRun(world: World, loadouts: readonly Loadout[]): void {
  const s = stateOf(world);
  s.armed = true;
  s.clearedLevel = -1;
  world.runners.forEach((r, index) => {
    const a = armsOf(r);
    const loadout = loadouts[index] ?? DEFAULT_LOADOUT;
    const weapons = loadout.weapons.filter(isWeaponId);
    if (!weapons.includes('blaster')) weapons.unshift('blaster');
    a.loadout = {
      weapons,
      equipped: weapons.includes(loadout.equipped) ? loadout.equipped : 'blaster',
      maxMissiles: Math.max(BASE_MAX_MISSILES, Math.min(MAX_MISSILE_CAP, Math.floor(loadout.maxMissiles) || BASE_MAX_MISSILES)),
      startShield: Boolean(loadout.startShield),
    };
    a.slot = Math.max(0, weapons.indexOf(a.loadout.equipped));
    a.charge = 0;
    a.coins = 0;
    applyLevelStart(r, a);
  });
}

function applyLevelStart(r: Runner, a: Arms): void {
  r.maxMissiles = a.loadout.maxMissiles;
  r.missiles = Math.min(r.missiles, a.loadout.maxMissiles);
  if (a.loadout.startShield) r.shield = true;
}

const clearBonus = (level: number): number => COIN_VALUES.clearBase + COIN_VALUES.clearPerLevel * level;

/**
 * Takes the coins earned since the last bank (call at the end of a run and when leaving it).
 * `completed`: the level was finished at the portal, so the clear bonus goes to the winner (both on a photo finish).
 * Returns 0 for an unarmed world or when cheats were used (like best/runs, cheated runs earn nothing).
 */
export function collectRunCoins(world: World, completed = false): number {
  const s = stateOf(world);
  if (completed) creditClear(world, s, world.winner ? [world.winner] : world.runners);
  let total = 0;
  for (const r of world.runners) {
    const a = armsOf(r);
    total += a.coins;
    a.coins = 0;
  }
  return s.armed && !world.cheatsUsed ? total : 0;
}

function creditClear(world: World, s: WeaponWorld, runners: readonly Runner[]): void {
  if (!s.armed || s.clearedLevel === world.level) return;
  s.clearedLevel = world.level;
  for (const r of runners) armsOf(r).coins += clearBonus(world.level);
}

// ---------- World hooks ----------

/** End of World.loadLevel: clears shots and drops, credits a solo level clear, applies level-start upgrades. */
export function weaponsOnLevel(world: World): void {
  const s = stateOf(world);
  if (s.armed && !world.versus && s.level >= 0 && world.level === s.level + 1 && s.clearedLevel !== s.level) {
    s.clearedLevel = s.level;
    armsOf(world.runner).coins += clearBonus(s.level);
  }
  s.level = world.level;
  s.shots = [];
  s.beams = [];
  s.drops = [];
  for (const r of world.runners) {
    const a = armsOf(r);
    a.charge = 0;
    a.flaming = 0;
    if (s.armed) applyLevelStart(r, a);
  }
}

/** World.respawn: drops a held charge. Solo retry (one runner) also clears the runner's shots in flight. */
export function weaponsOnRespawn(world: World, r: Runner): void {
  const a = armsOf(r);
  a.charge = 0;
  a.flaming = 0;
  const s = stateOf(world);
  s.shots = s.shots.filter((shot) => shot.runner !== r);
  s.beams = s.beams.filter((beam) => beam.runner !== r);
}

/** World.breakObstacle: coins for the breaker, and monsters drop a coin pickup. */
export function weaponsOnBreak(world: World, obstacle: Obstacle, runner: Runner, shield = false): void {
  const wall = obstacle.type === 'wall';
  if (!shield) armsOf(runner).coins += wall ? COIN_VALUES.wall : COIN_VALUES.kill;
  if (wall) return;
  stateOf(world).drops.push({
    x: obstacle.wx + obstacle.w / 2, y: obstacle.y + obstacle.h / 2, vx: (Math.random() - .5) * 2.4, vy: -5.5,
    value: obstacle.type === 'boss' ? COIN_VALUES.boss : COIN_VALUES.drop, life: 720, grounded: false, spin: Math.random() * 6,
  });
}

/** World.collide when a runner takes a pickup: power cells are worth a coin. */
export function weaponsOnPickup(_world: World, r: Runner, pickup: Pickup): void {
  if (pickup.kind === 'cell') armsOf(r).coins += COIN_VALUES.cell;
}

/**
 * Replaces `if (fire) this.fireBlaster(r)` in World.stepRunner: weapon swap on a 'swap' press, then the
 * equipped weapon's fire logic. The blaster still goes through World.fireBlaster.
 */
export function fireWeapon(world: World, r: Runner): void {
  const a = armsOf(r);
  const { fire, swap } = r.input;
  if (swap && !a.prevSwap) swapWeapon(world, r);
  a.prevSwap = Boolean(swap);
  const def = currentWeapon(r);
  if (def.kind === 'pulse') {
    if (fire) world.fireBlaster(r);
    return;
  }
  if (def.kind === 'charge') {
    if (fire) {
      if (!r.blasterCooldown) a.charge = Math.min(CHARGE_TICKS, a.charge + 1);
    } else if (a.charge > 0) {
      releaseNova(world, r, def, a.charge / CHARGE_TICKS);
      a.charge = 0;
    }
    return;
  }
  if (!fire) { a.flaming = 0; return; }
  if (r.blasterCooldown) return;
  r.blasterCooldown = def.cooldown;
  const [x, y, dir] = muzzle(r);
  pose(r);
  const s = stateOf(world);
  const base = { weapon: def.id, x, y, runner: r, hit: [], pierce: false, armorPiercing: false, bounces: 0, damage: def.damage };
  switch (def.kind) {
    case 'spread':
      for (const angle of [-.17, 0, .17]) {
        const speed = 17;
        s.shots.push({ ...base, hit: [], vx: Math.cos(angle) * speed * dir, vy: Math.sin(angle) * speed, life: Math.ceil(def.range / speed), maxLife: Math.ceil(def.range / speed), size: 4 });
      }
      push(world, 'pulse', r);
      break;
    case 'bounce':
      s.shots.push({ ...base, vx: 9 * dir, vy: -4, life: Math.ceil(def.range / 9), maxLife: Math.ceil(def.range / 9), size: 8, bounces: 4 });
      push(world, 'pulse', r);
      break;
    case 'homing':
      for (const lift of [-1, 1]) {
        s.shots.push({ ...base, hit: [], vx: 6 * dir, vy: lift * 3.2, life: 70, maxLife: 70, size: 5 });
      }
      push(world, 'launch', r);
      break;
    case 'flame': {
      const speed = 7.5;
      const life = Math.ceil(def.range / speed);
      s.shots.push({ ...base, x: x - 6 * dir, vx: speed * dir + r.vx * .5, vy: (Math.random() - .5) * 1.6, life, maxLife: life, size: 5, pierce: true });
      if (a.flaming++ % 12 === 0) push(world, 'pulse', r);
      break;
    }
    case 'beam':
      fireBeam(world, r, def, x, y, dir);
      push(world, 'pulse', r);
      break;
  }
}

/** Cycles to the next owned weapon. */
export function swapWeapon(world: World, r: Runner): void {
  const a = armsOf(r);
  if (a.loadout.weapons.length < 2) return;
  a.slot = (a.slot + 1) % a.loadout.weapons.length;
  a.charge = 0;
  a.flaming = 0;
  push(world, 'weapon-swap', r);
}

function muzzle(r: Runner): [number, number, Facing] {
  const dir = r.facing;
  return [r.x + (dir > 0 ? 42 : 2), r.feet - (r.ducking ? 21 : 33), dir];
}

function pose(r: Runner): void {
  r.blasterPose = 8;
  r.shotKind = 'pulse';
}

function releaseNova(world: World, r: Runner, def: WeaponDef, frac: number): void {
  if (r.blasterCooldown) return;
  r.blasterCooldown = def.cooldown;
  const [x, y, dir] = muzzle(r);
  pose(r);
  const speed = 15;
  const life = Math.ceil(def.range / speed);
  stateOf(world).shots.push({
    weapon: def.id, x, y, vx: speed * dir, vy: 0, life, maxLife: life, runner: r, hit: [], bounces: 0,
    damage: 1 + Math.round(frac * (def.damage - 1)), size: 4 + frac * 9, pierce: frac >= 1, armorPiercing: frac >= 1,
  });
  push(world, frac > .5 ? 'launch' : 'pulse', r);
}

function fireBeam(world: World, r: Runner, def: WeaponDef, x: number, y: number, dir: Facing): void {
  const s = stateOf(world);
  const hits = world.obstacles
    .filter((o) => !o.broken && y >= o.y - 6 && y <= o.y + o.h + 6 && (dir > 0 ? o.wx + o.w > x && o.wx < x + def.range : o.wx < x && o.wx + o.w > x - def.range))
    .sort((p, q) => (dir > 0 ? p.wx - q.wx : q.wx + q.w - (p.wx + p.w)));
  let end = x + def.range * dir;
  for (const o of hits) {
    if (o.type === 'wall') {
      end = dir > 0 ? o.wx : o.wx + o.w;
      damage(world, o, def.damage, r, end, y, dir, false, false, def.id);
      break;
    }
    damage(world, o, def.damage, r, o.wx + o.w / 2, y, dir, false, false, def.id);
  }
  s.beams.push({ x1: x, x2: end, y, life: 10, max: 10, color: def.color, glow: def.glow, runner: r });
}

// ---------- Damage ----------

/**
 * Damages a monster or wall through the enemies damage path (enemies.ts damageObstacle: brute front armor,
 * boss invulnerability and phases; a lethal hit goes through World.breakObstacle). `quiet` hits (flame licks)
 * drop the per-hit 'target-hit' event so a continuous weapon does not spam the hit sound.
 */
export function damage(world: World, o: Obstacle, amount: number, runner: Runner, x: number, y: number, dir: Facing, quiet = false, armorPiercing = false, kind = 'pulse'): DamageResult {
  if (o.broken) return 'immune';
  const mark = world.events.length;
  const result = damageObstacle(world, o, amount, { runner, dir, kind, x, y, armorPiercing });
  if (quiet && result === 'hit') {
    for (let i = world.events.length - 1; i >= mark; i--) if (world.events[i]!.type === 'target-hit') world.events.splice(i, 1);
  }
  return result;
}

// ---------- Step ----------

const isSolid = (s: Surface): boolean => !('broken' in s && s.broken);

/** Called once per World.step (after the built-in projectiles): moves weapon shots, beams and coin drops. */
export function stepWeapons(world: World): void {
  const s = stateOf(world);
  for (const shot of s.shots) stepShot(world, shot);
  s.shots = s.shots.filter((shot) => shot.life > 0);
  for (const beam of s.beams) beam.life--;
  if (s.beams.length) s.beams = s.beams.filter((beam) => beam.life > 0);
  stepDrops(world, s);
}

function stepShot(world: World, shot: WeaponShot): void {
  const def = WEAPONS[shot.weapon];
  if (def.kind === 'homing') steer(world, shot);
  if (def.kind === 'bounce') shot.vy += .42;
  if (def.kind === 'flame') { shot.vx *= .97; shot.vy -= .05; shot.size += .45; }
  const oldX = shot.x;
  const oldY = shot.y;
  shot.x += shot.vx;
  shot.y += shot.vy;
  shot.life--;
  if (def.kind === 'bounce') bounce(world, shot, oldY);
  if (shot.y > GROUND_Y + 90 || shot.y < -400) { shot.life = 0; return; }
  const left = Math.min(oldX, shot.x) - shot.size;
  const right = Math.max(oldX, shot.x) + shot.size;
  const top = Math.min(oldY, shot.y) - shot.size;
  const bottom = Math.max(oldY, shot.y) + shot.size;
  const dir: Facing = shot.vx >= 0 ? 1 : -1;
  const hits = world.obstacles
    .filter((o) => !o.broken && !shot.hit.includes(o) && left < o.wx + o.w && right > o.wx && top < o.y + o.h && bottom > o.y)
    .sort((p, q) => (dir > 0 ? p.wx - q.wx : q.wx - p.wx));
  for (const o of hits) {
    const quiet = def.kind === 'flame';
    const result = damage(world, o, shot.damage, shot.runner, dir > 0 ? o.wx + 3 : o.wx + o.w - 3, shot.y, dir, quiet, shot.armorPiercing, shot.weapon);
    if (result === 'blocked' && def.kind !== 'flame') { shot.life = 0; return; }
    if (!shot.pierce || o.type === 'wall') { shot.life = 0; return; }
    shot.hit.push(o);
  }
}

function steer(world: World, shot: WeaponShot): void {
  if (!shot.target || shot.target.broken) {
    shot.target = undefined;
    let best = 380;
    for (const o of world.obstacles) {
      if (o.broken || o.type === 'wall' || o.type === 'crystal') continue;
      const d = Math.hypot(o.wx + o.w / 2 - shot.x, o.y + o.h / 2 - shot.y);
      const ahead = (o.wx + o.w / 2 - shot.x) * Math.sign(shot.vx || 1) > -40;
      if (d < best && ahead) { best = d; shot.target = o; }
    }
  }
  const speed = Math.min(12, Math.hypot(shot.vx, shot.vy) + .35);
  let angle = Math.atan2(shot.vy, shot.vx);
  if (shot.target) {
    const want = Math.atan2(shot.target.y + shot.target.h / 2 - shot.y, shot.target.wx + shot.target.w / 2 - shot.x);
    let turn = want - angle;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    angle += Math.max(-.13, Math.min(.13, turn));
  } else {
    // No target: level out and fly straight.
    angle *= .9;
  }
  shot.vx = Math.cos(angle) * speed;
  shot.vy = Math.sin(angle) * speed;
}

function bounce(world: World, shot: WeaponShot, oldY: number): void {
  if (shot.vy <= 0) return;
  for (const surface of world.surfaces) {
    if (!isSolid(surface) || shot.x < surface.x || shot.x > surface.x + surface.w) continue;
    if (oldY + shot.size <= surface.y + .5 && shot.y + shot.size >= surface.y) {
      shot.y = surface.y - shot.size;
      shot.vy = -Math.max(5.5, Math.abs(shot.vy) * .8);
      if (--shot.bounces < 0) shot.life = 0;
      world.burst(shot.x, surface.y - 2, 4, WEAPONS[shot.weapon].color, 1.6);
      return;
    }
  }
}

function stepDrops(world: World, s: WeaponWorld): void {
  if (!s.drops.length) return;
  for (const drop of s.drops) {
    drop.life--;
    drop.spin += .12;
    if (!drop.grounded) {
      drop.vy = Math.min(9, drop.vy + .38);
      const oldY = drop.y;
      drop.x += drop.vx;
      drop.y += drop.vy;
      for (const surface of world.surfaces) {
        if (!isSolid(surface) || drop.x < surface.x || drop.x > surface.x + surface.w) continue;
        if (drop.vy >= 0 && oldY + 8 <= surface.y + .5 && drop.y + 8 >= surface.y) {
          drop.y = surface.y - 8;
          drop.vx = 0;
          drop.vy = 0;
          drop.grounded = true;
          break;
        }
      }
      if (drop.y > GROUND_Y + 90) drop.life = 0;
    }
    if (drop.life <= 0) continue;
    for (const r of world.runners) {
      if (!r.alive) continue;
      const box = r.ducking ? { x: r.x + 6, y: r.feet - 30, w: 38, h: 28 } : { x: r.x + 7, y: r.feet - 58, w: 31, h: 56 };
      if (drop.x + 9 < box.x || drop.x - 9 > box.x + box.w || drop.y + 9 < box.y || drop.y - 9 > box.y + box.h) continue;
      armsOf(r).coins += drop.value;
      drop.life = 0;
      world.burst(drop.x, drop.y, 9, '#ffd34d', 2.4);
      push(world, 'coin', r, drop.x, drop.y);
      break;
    }
  }
  s.drops = s.drops.filter((drop) => drop.life > 0);
}

