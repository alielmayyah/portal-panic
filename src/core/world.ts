// Pure simulation for Portal Panic. No DOM, no Phaser: renderers read this state.
// Fixed 60 Hz steps; same physics constants as the original world.js.
import { GROUND_Y, LEVELS, PLATFORM_DEPTH } from './levels';
import type {
  Action, Blast, DeathCause, Debris, EnemyShot, Facing, GadgetKind, LevelDef, LevelStart, Obstacle, Particle, Pickup,
  Platform, Point, Projectile, Runner, RunnerOptions, ShotKind, Surface, WorldEvent, WorldEventType, WorldOptions,
} from './types';
import {
  clearPowers, enemyClock, grantPower, hazardContact, isFrozen, isGhost, isGiant, isPowerKind, jumpScale, resetWorldPowers, speedScale,
  stepWorldPowers, tickPowers,
} from './powers';
import {
  type BossInfo, type DamageResult, type DamageSource, MONSTER_DEATHS, MONSTER_DEATH_BY_TYPE, damageObstacle, initEnemies,
  onBreakObstacle, portalSealed, restoreMonsters, stepEnemies,
} from './enemies';
import { fireWeapon, stepWeapons, weaponsOnBreak, weaponsOnLevel, weaponsOnPickup, weaponsOnRespawn } from './weapons';

export { GROUND_Y, LEVELS, PLATFORM_DEPTH };
export const W = 960;
export const H = 420;
export const STEP_MS = 1000 / 60;
export const PLAYER_COLORS = ['#97edf0', '#ffdb71'] as const;
export const MAX_MISSILES = 5;
export const BOOTS_TICKS = 600;
export const ACTIONS: readonly Action[] = ['left', 'right', 'jump', 'duck', 'fire', 'missile', 'swap'];
export const GADGETS: Readonly<Record<GadgetKind, { name: string; color: string }>> = {
  shield: { name: 'Phase shield', color: '#70f1fa' },
  boots: { name: 'Gravity boots', color: '#e6a7ff' },
};
/** Every event type that ends a solo run (or sends a versus runner back to its checkpoint). */
export const DEATH_EVENTS: readonly DeathCause[] = ['crystal-hit', 'slime-hit', 'drone-hit', 'sentry-hit', 'fall', ...MONSTER_DEATHS];
export const isDeathEvent = (type: WorldEventType): type is DeathCause => (DEATH_EVENTS as readonly string[]).includes(type);

export const RUN_SPEED = 6;
/** Ducked walking speed (55% of RUN_SPEED). */
export const DUCK_SPEED = RUN_SPEED * .55;
/** Ducking on the ground faster than this starts a slide. */
export const SLIDE_MIN_SPEED = 4;
/** Length of a duck slide in ticks. */
export const SLIDE_TICKS = 22;
const JUMP_V = -15.7;
const GRAVITY = .84;
const JUMP_BUFFER = 8;
const BLASTER_RANGE = 320;
const MISSILE_RANGE = 540;
const START_X = 90;
const RESPAWN_INVULN = 76;

export interface Rect { x: number; y: number; w: number; h: number }

const bounds = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Standing hitbox. */
export const standingBox = (r: Pick<Runner, 'x' | 'feet'>): Rect => ({ x: r.x + 7, y: r.feet - 58, w: 31, h: 56 });
/** Ducked (and sliding) hitbox. */
export const duckedBox = (r: Pick<Runner, 'x' | 'feet'>): Rect => ({ x: r.x + 6, y: r.feet - 30, w: 38, h: 28 });
export const runnerBox = (r: Pick<Runner, 'x' | 'feet' | 'ducking'>): Rect => (r.ducking ? duckedBox(r) : standingBox(r));

/** Hitbox for slimes and drones (crystals use crystalShards). */
export const hazardBox = (o: Pick<Obstacle, 'wx' | 'y' | 'w' | 'h'>): Rect => ({ x: o.wx + 5, y: o.y + 5, w: o.w - 10, h: o.h - 5 });

/**
 * Outline polygons of a crystal's spikes, in world units. This is both the hitbox and the shape renderers
 * must draw (outer outline), so what kills you is exactly what you see.
 */
export function crystalShards(o: Pick<Obstacle, 'wx' | 'y' | 'w' | 'h' | 'shards'>, x = o.wx): Point[][] {
  const shards = o.shards ?? 1;
  const b = o.w / shards;
  const heights = [1, .78];
  const y = o.y + o.h;
  const polys: Point[][] = [];
  for (let i = 0; i < shards; i++) {
    const a = x + i * b;
    const h = o.h * (heights[i] ?? .78);
    polys.push([[a, y], [a + b * .16, y - h * .56], [a + b * .55, y - h], [a + b * .89, y - h * .62], [a + b, y]]);
  }
  return polys;
}

/** Separating-axis test of an axis-aligned rect against a convex polygon. Touching edges do not overlap. */
export function rectHitsPolygon(rect: Rect, poly: readonly Point[]): boolean {
  const corners: Point[] = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]];
  const axes: Point[] = [[1, 0], [0, 1]];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    axes.push([y1 - y2, x2 - x1]);
  }
  for (const [ax, ay] of axes) {
    let pMin = Infinity, pMax = -Infinity, rMin = Infinity, rMax = -Infinity;
    for (const [px, py] of poly) { const d = px * ax + py * ay; pMin = Math.min(pMin, d); pMax = Math.max(pMax, d); }
    for (const [px, py] of corners) { const d = px * ax + py * ay; rMin = Math.min(rMin, d); rMax = Math.max(rMax, d); }
    if (pMax <= rMin || rMax <= pMin) return false;
  }
  return true;
}

/** True when the runner rect touches the hazard's lethal area. Walls never kill. */
export function hazardHits(rect: Rect, o: Obstacle): boolean {
  if (o.type === 'wall' || o.mob?.grace) return false; // fresh monster spawns are harmless (enemies.ts)
  if (o.type === 'crystal') return crystalShards(o).some((poly) => rectHitsPolygon(rect, poly));
  return overlaps(rect, hazardBox(o));
}

const DEATH_BY_HAZARD = { crystal: 'crystal-hit', slime: 'slime-hit', drone: 'drone-hit', ...MONSTER_DEATH_BY_TYPE } as const;

export function createRunner({ name = 'Rick', color = PLAYER_COLORS[0], character = 'rick', x = START_X }: RunnerOptions = {}): Runner {
  return {
    name, color, character, x, startX: x, feet: GROUND_Y, vx: 0, vy: 0, facing: 1,
    airTicks: 0, grounded: true, ducking: false, sliding: 0, slideSpeed: 0, alive: true, coyote: 0, jumpBuffer: 0,
    prevJump: false, extraJump: false, input: {}, anim: 0, maxX: x, bonus: 0,
    missiles: 3, blasterCooldown: 0, missileCooldown: 0, blasterPose: 0, kills: 0, walls: 0,
    shield: false, boots: 0, checkpoint: 0, respawnAt: 0, invuln: 0, lagTicks: 0,
    surface: null, blockedBy: null, safeX: x, god: false, infiniteAmmo: false,
  };
}

const isPlatform = (s: Surface | null): s is Platform => Boolean(s && 'travel' in s);
const isBroken = (s: Surface) => 'broken' in s && Boolean(s.broken);
const surfaceDy = (s: Surface) => ('dy' in s ? s.dy : 0);

interface ShotSpec { kind: ShotKind; speed: number; remaining: number; damage: number }

export class World {
  runners: Runner[];
  /** The main runner (solo player, or Rick in versus). */
  runner: Runner;
  versus: boolean;
  tick = 0;
  /** Effects clock; keeps running while the world is frozen. */
  fxTick = 0;
  /** Left edge of the view in world units. Owned by the renderer (camera rule), stored here for convenience. */
  camera = 0;
  /** Renderer hint: jump the camera to its target on the next draw. */
  snapCamera = false;
  /** Events since the last drain. Consumers splice(0) them after each step. */
  events: WorldEvent[] = [];
  /** Set by any cheat (except UNLOCKALL). Survives loadLevel/retry. */
  cheatsUsed = false;
  /** Versus racers further apart than this are warped together; the scene raises it to what its zoomed-out camera can show. */
  regroupGap = 480;

  level = 0;
  frozen = false;
  winner: Runner | null = null;
  entrants: Runner[] = [];
  /** 0..1, set by the session while crossing to animate runners into the portal. */
  portalPull = 0;
  blasts: Blast[] = [];
  projectiles: Projectile[] = [];
  enemyShots: EnemyShot[] = [];
  debris: Debris[] = [];
  particles: Particle[] = [];
  shake = 0;
  flash = 0;
  riftFlash = 0;
  platforms: Platform[] = [];
  obstacles: Obstacle[] = [];
  walls: Obstacle[] = [];
  surfaces: Surface[] = [];
  orbs: Pickup[] = [];
  levelStart: LevelStart = { bonus: 0, kills: 0, missiles: 3, walls: 0 };
  /** 'drone-warning' already sent this level. */
  droneWarned = false;
  /** The level's boss (enemies.ts) or null. HUD: bossHud(world). */
  boss: BossInfo | null = null;

  constructor({ runner, rival, level = 0 }: WorldOptions) {
    this.runners = rival ? [runner, rival] : [runner];
    this.runner = runner;
    this.versus = Boolean(rival);
    this.loadLevel(level);
  }

  get score(): number { return this.scoreFor(this.runner); }
  get dimension(): LevelDef { return LEVELS[this.level]!; }
  scoreFor(runner: Runner): number { return Math.floor((runner.maxX - runner.startX) / 20) + runner.bonus; }

  private emit(type: WorldEventType, runner: Runner | null = null, x?: number, y?: number) {
    const event: WorldEvent = { type, runner };
    if (x !== undefined) event.x = x;
    if (y !== undefined) event.y = y;
    this.events.push(event);
  }

  loadLevel(level: number): void {
    this.level = level;
    this.tick = 0;
    this.camera = 0;
    this.frozen = false;
    this.winner = null;
    this.entrants = [];
    this.portalPull = 0;
    this.blasts = [];
    this.projectiles = [];
    this.enemyShots = [];
    this.debris = [];
    this.particles = [];
    this.shake = this.flash = this.riftFlash = 0;
    this.droneWarned = false;
    const dim = this.dimension;
    this.platforms = dim.platforms.map((deck) => ({ ...deck, baseY: deck.y, dy: 0 }));
    this.obstacles = dim.hazards.map((o) => ({
      ...o, x: o.wx, baseX: o.wx, baseY: o.y, maxHp: o.hp, charge: 0, readyAt: 70, flash: 0,
    }));
    initEnemies(this);
    this.walls = this.obstacles.filter((obstacle) => obstacle.type === 'wall');
    this.surfaces = [...dim.floors, ...this.platforms, ...this.walls];
    this.orbs = dim.pickups.map((o) => ({ ...o }));
    for (const r of this.runners) {
      this.place(r, r.startX);
      r.maxX = r.startX;
      r.safeX = r.startX;
      r.checkpoint = 0;
      r.shield = false;
      r.boots = 0;
      clearPowers(r);
      r.missiles = Math.max(3, r.missiles);
    }
    resetWorldPowers(this);
    const { bonus, kills, missiles, walls } = this.runner;
    this.levelStart = { bonus, kills, missiles, walls };
    weaponsOnLevel(this);
  }

  nextLevel(): void {
    this.runner.bonus = this.score + 100;
    this.loadLevel(this.level + 1);
  }

  place(r: Runner, x: number): void {
    Object.assign(r, {
      x, feet: GROUND_Y, vx: 0, vy: 0, facing: 1 as Facing, airTicks: 0, jumpBuffer: 0,
      coyote: 0, prevJump: false, ducking: false, sliding: 0, slideSpeed: 0, grounded: true, alive: true, respawnAt: 0,
      blasterCooldown: 0, missileCooldown: 0, blasterPose: 0, extraJump: false, lagTicks: 0,
      invuln: RESPAWN_INVULN, surface: null, blockedBy: null,
    });
  }

  respawn(r: Runner): void {
    this.place(r, r.checkpoint || r.startX);
    r.missiles = Math.max(2, r.missiles);
    weaponsOnRespawn(this, r);
    restoreMonsters(this, r);
    this.emit('respawn', r);
  }

  retry(): void {
    if (!this.runner.checkpoint) {
      this.events.length = 0;
      Object.assign(this.runner, this.levelStart);
      this.loadLevel(this.level);
      return;
    }
    this.frozen = false;
    this.projectiles.length = 0;
    this.enemyShots.length = 0;
    this.events.length = 0;
    this.respawn(this.runner);
  }

  /** Ends the level as if `runner` entered the portal (used by the SKIP cheat). */
  forcePortal(runner: Runner = this.runner): void {
    this.entrants = [runner];
    this.winner = runner;
    this.frozen = true;
    this.riftFlash = 1;
    this.emit('portal', runner);
  }

  step(): void {
    this.updateEffects();
    if (this.frozen) return;
    this.tick++;
    this.moveScenery();
    this.stepProjectiles();
    stepWeapons(this);
    // Time freeze (powers.ts) stops sentries and their shots.
    if (!stepWorldPowers(this)) this.stepSentries();
    stepEnemies(this);
    this.entrants.length = 0;
    const dim = this.dimension;
    for (const r of this.runners) {
      if (!r.alive) {
        if (this.versus && this.tick >= r.respawnAt) this.respawn(r);
        continue;
      }
      this.stepRunner(r);
      this.collide(r);
      if (!r.alive) continue;
      r.maxX = Math.max(r.maxX, r.x);
      if (!r.checkpoint && r.x + 22 >= dim.checkpoint && r.feet > GROUND_Y - 80) {
        r.checkpoint = dim.checkpoint;
        this.emit('checkpoint', r);
      }
      if (Math.abs(r.x + 22 - dim.exit) < 28 && r.feet > GROUND_Y - 94 && r.feet <= GROUND_Y + 1 && !portalSealed(this)) this.entrants.push(r);
    }
    if (this.entrants.length) {
      this.winner = this.entrants.length === 1 ? this.entrants[0]! : null;
      this.frozen = true;
      this.riftFlash = 1;
      this.emit('portal', this.winner);
      return;
    }
    if (this.versus && this.runners.every((r) => r.alive)) this.keepRacersTogether();
  }

  moveScenery(): void {
    for (const deck of this.platforms) {
      if (!deck.travel) continue;
      const y = deck.baseY + Math.sin(this.tick * .034 + deck.phase) * deck.travel;
      deck.dy = y - deck.y;
      deck.y = y;
    }
    for (const obstacle of this.obstacles) {
      if (obstacle.broken) continue;
      if (obstacle.flash > 0) obstacle.flash--;
      if (isFrozen(this)) continue; // time freeze (powers.ts)
      const tick = enemyClock(this);
      if (obstacle.patrol) {
        obstacle.wx = obstacle.baseX + Math.sin(tick * (.046 + this.level * .008) + (obstacle.phase ?? 0)) * obstacle.patrol;
      }
      if (obstacle.lift) {
        const y = obstacle.charge ? (obstacle.aimY ?? obstacle.y)
          : obstacle.baseY + Math.sin(tick * .061 + (obstacle.phase ?? 0) * 1.4) * obstacle.lift;
        obstacle.y += bounds(y - obstacle.y, -3, 3);
      }
    }
  }

  stepSentries(): void {
    for (const shot of this.enemyShots) {
      shot.prevX = shot.x;
      shot.x += shot.vx;
      if (shot.vy !== undefined) { shot.y += shot.vy; shot.vy += shot.gravity ?? 0; } // arcing monster goo (enemies.ts)
      shot.life--;
      if (this.wallInLine(shot.prevX, shot.x, shot.y)) shot.life = 0;
    }
    this.enemyShots = this.enemyShots.filter((shot) => shot.life > 0);

    for (const sentry of this.obstacles) {
      if (!sentry.volley || sentry.broken) continue;
      const x = sentry.wx + sentry.w / 2;
      const y = sentry.y + sentry.h / 2;
      if (sentry.charge > 0) {
        if (--sentry.charge === 0) {
          this.enemyShots.push({ x, prevX: x, y, vx: (sentry.aim ?? -1) * (8.7 + this.level * .75), life: 53, dodged: [] });
          sentry.readyAt = this.tick + (sentry.volley === 2 ? 74 : 96);
          this.emit('enemy-fire');
        }
        continue;
      }
      if (this.tick < sentry.readyAt) continue;
      let gap = 385;
      let target: Runner | null = null;
      const lift = sentry.lift ?? 0;
      for (const runner of this.runners) {
        const tx = runner.x + 22;
        const distance = Math.abs(tx - x);
        if (!runner.alive || distance < 105 || distance >= gap || this.wallInLine(x, tx, y)) continue;
        gap = distance;
        target = runner;
        sentry.aim = Math.sign(tx - x);
        sentry.aimY = bounds(runner.feet - 44 - sentry.h / 2, sentry.baseY - lift, sentry.baseY + lift);
      }
      if (target) {
        sentry.charge = 42 - this.level * 3;
        this.emit('enemy-charge', target);
        if (!this.droneWarned) {
          this.droneWarned = true;
          this.emit('drone-warning', target, x, y);
        }
      }
    }
  }

  wallInLine(from: number, to: number, y: number): boolean {
    const left = Math.min(from, to);
    const right = Math.max(from, to);
    return this.walls.some((wall) => !wall.broken && left < wall.wx + wall.w && right > wall.wx && y > wall.y && y < wall.y + wall.h);
  }

  keepRacersTogether(): void {
    const [a, b] = this.runners as [Runner, Runner];
    const [back, lead] = a.x < b.x ? [a, b] : [b, a];
    lead.lagTicks = 0;
    if (lead.x - back.x < this.regroupGap) { back.lagTicks = 0; return; }
    if (++back.lagTicks < 75) return;
    // Put a separated racer on safe ground behind the leader so both can see the shared track.
    const spot = lead.x - 330;
    const floor = this.dimension.floors.find((f) => f.x + f.w - 65 >= spot);
    if (!floor) return;
    this.place(back, Math.max(START_X, floor.x + 35, spot));
    this.emit('regroup', back);
  }

  stepRunner(r: Runner): void {
    const { left, right, jump, duck, missile } = r.input;
    tickPowers(this, r);
    if (r.blasterCooldown) r.blasterCooldown--;
    if (r.missileCooldown) r.missileCooldown--;
    if (r.blasterPose) r.blasterPose--;
    if (r.boots) r.boots--;
    if (r.invuln) r.invuln--;
    if (r.grounded && isPlatform(r.surface) && r.surface.travel) r.feet += r.surface.dy;
    if (r.grounded) { r.coyote = 6; r.extraJump = r.boots > 0; }
    else if (r.coyote) r.coyote--;
    const jumpPressed = Boolean(jump) && !r.prevJump;
    r.prevJump = Boolean(jump);
    if (jumpPressed) r.jumpBuffer = JUMP_BUFFER;
    else if (r.jumpBuffer) r.jumpBuffer--;
    if (r.jumpBuffer && r.coyote) this.jump(r, false);
    else if (jumpPressed && r.boots && r.extraJump) this.jump(r, true);

    const direction = Number(Boolean(right)) - Number(Boolean(left));
    if (direction) r.facing = direction as Facing;
    if (r.sliding && !(duck && r.grounded)) r.sliding = 0;
    if (r.sliding) {
      // A slide keeps its momentum and decays linearly to duck speed over SLIDE_TICKS.
      r.sliding--;
      const sign = Math.sign(r.vx) || r.facing;
      r.vx = sign * (DUCK_SPEED + (r.slideSpeed - DUCK_SPEED) * (r.sliding / SLIDE_TICKS));
    } else {
      // The first tick of a fast grounded duck keeps full speed; the slide then starts below.
      const slideStart = duck && r.grounded && !r.ducking && Math.abs(r.vx) > SLIDE_MIN_SPEED;
      const speed = (duck && r.grounded ? DUCK_SPEED : RUN_SPEED) * speedScale(r);
      if (!slideStart) r.vx += bounds(direction * speed - r.vx, -1.7, 1.7);
    }
    this.moveRunner(r, Boolean(duck));
    if (r.sliding && r.vx === 0) r.sliding = 0;
    r.airTicks++;
    if (!jump && r.airTicks > 6 && r.vy < -7.5) r.vy = -7.5;
    r.vy += GRAVITY + (duck && !r.grounded ? .75 : 0);
    const previousFeet = r.feet;
    r.feet += r.vy;
    const wasGrounded = r.grounded;
    const previousSurface = r.surface;
    r.grounded = false;
    r.surface = null;
    if (r.vy < 0) this.checkCeiling(r, previousFeet);
    if (r.vy >= 0) {
      let floor: Surface | null = null;
      for (const surface of this.surfaces) {
        if (isBroken(surface)) continue;
        const oldY = surface === previousSurface ? surface.y : surface.y - surfaceDy(surface);
        if (r.x + 34 > surface.x && r.x + 10 < surface.x + surface.w &&
            previousFeet <= oldY + .5 && r.feet >= surface.y && (!floor || surface.y < floor.y)) floor = surface;
      }
      if (floor) {
        r.feet = floor.y;
        r.vy = 0;
        r.grounded = true;
        r.surface = floor;
        if (!wasGrounded && r.airTicks > 8) this.burst(r.x + 20, r.feet - 2, 5, '#c6a7ce', 1.2);
        r.airTicks = 0;
      }
    }
    const wasDucking = r.ducking;
    r.ducking = Boolean(duck && r.grounded);
    if (r.ducking && !wasDucking) {
      this.emit('duck', r, r.x + 22, r.feet);
      if (Math.abs(r.vx) > SLIDE_MIN_SPEED) {
        r.sliding = SLIDE_TICKS;
        r.slideSpeed = Math.abs(r.vx);
        this.emit('slide', r, r.x + 22, r.feet);
      }
    }
    if (!r.ducking) r.sliding = 0;
    if (r.grounded) {
      r.anim += Math.abs(r.vx) * .07;
      this.trackSafeGround(r);
    }
    if (missile && this.fireMissile(r)) return;
    // Equipped weapon and weapon swap (weapons.ts); the blaster still fires through fireBlaster.
    fireWeapon(this, r);
  }

  /** Remembers the last spot on a ground floor with room on both sides (god-mode fall rescue). */
  private trackSafeGround(r: Runner): void {
    const floor = this.dimension.floors.find((f) => f === r.surface);
    if (floor && r.x >= floor.x + 12 && r.x + 44 <= floor.x + floor.w - 12) r.safeX = r.x;
  }

  moveRunner(r: Runner, duck: boolean): void {
    const wanted = r.x + r.vx;
    let x = bounds(wanted, 12, this.dimension.width - 52);
    if (x !== wanted) r.vx = 0;
    const top = r.feet - (duck && r.grounded ? 30 : 60);
    const rightEdge = duck && r.grounded ? 45 : 40;
    let blockingWall: Obstacle | null = null;
    for (const wall of this.walls) {
      if (wall.broken || r.feet <= wall.y || top >= wall.y + wall.h) continue;
      if (x > r.x && r.x + 22 < wall.wx && x + rightEdge >= wall.wx) {
        x = wall.wx - rightEdge;
        blockingWall = wall;
      } else if (x < r.x && r.x + 22 > wall.wx + wall.w && x + 5 <= wall.wx + wall.w) {
        x = wall.wx + wall.w - 5;
        blockingWall = wall;
      }
    }
    if (blockingWall) {
      r.vx = 0;
      if (blockingWall !== r.blockedBy) this.emit('wall-blocked', r);
    }
    r.blockedBy = blockingWall;
    r.x = x;
  }

  checkCeiling(r: Runner, previousFeet: number): void {
    const headHeight = r.character === 'rick' ? 72 : 62;
    let stop = -Infinity;
    for (const platform of this.platforms) {
      // Grazing a ledge corner (12px or less of the 24px head) does not bump, so late coyote jumps survive.
      if (Math.min(r.x + 33, platform.x + platform.w) - Math.max(r.x + 9, platform.x) <= 12) continue;
      const underside = platform.y + PLATFORM_DEPTH;
      // A descending deck has already moved this tick; test against where its underside was.
      const sweptUnderside = Math.min(underside, underside - platform.dy);
      const headBefore = previousFeet - headHeight;
      const headAfter = r.feet - headHeight;
      // Some low ledges allow walking underneath with reduced clearance.
      const startingBelow = r.airTicks === 1 && previousFeet > sweptUnderside + 26;
      if (headAfter < underside && (headBefore >= sweptUnderside - .5 || startingBelow)) {
        stop = Math.max(stop, underside + headHeight);
      }
    }
    if (stop === -Infinity) return;
    r.feet = Math.min(previousFeet, stop);
    r.vy = 0;
    this.burst(r.x + 22, r.feet - headHeight, 5, '#dcc7e0', 1.1);
    this.emit('bump', r);
  }

  jump(r: Runner, boost: boolean): void {
    r.vy = JUMP_V * (boost ? .88 : 1) * jumpScale(r);
    r.airTicks = r.coyote = r.jumpBuffer = 0;
    r.grounded = false;
    r.sliding = 0;
    r.extraJump = !boost && r.boots > 0;
    this.emit(boost ? 'boost' : 'jump', r);
    this.burst(r.x + 20, r.feet - 2, boost ? 12 : 5, boost ? GADGETS.boots.color : '#c6a7ce', boost ? 3 : 1.5);
  }

  fireBlaster(r: Runner): void {
    if (r.blasterCooldown) return;
    r.blasterCooldown = 15;
    this.launch(r, { kind: 'pulse', speed: 20, remaining: BLASTER_RANGE, damage: 1 });
  }

  fireMissile(r: Runner): boolean {
    if (r.missileCooldown) return false;
    if (!r.missiles && !r.infiniteAmmo) { this.emit('empty', r); return false; }
    if (!r.infiniteAmmo) r.missiles--;
    r.missileCooldown = 26;
    this.launch(r, { kind: 'missile', speed: 12, remaining: MISSILE_RANGE, damage: 3 });
    return true;
  }

  launch(r: Runner, spec: ShotSpec): void {
    const dir = r.facing;
    const wx = r.x + (dir > 0 ? 42 : 2);
    const y = r.feet - (r.ducking ? 21 : 33);
    const shot: Projectile = { ...spec, wx, y, dir, runner: r };
    if (spec.kind === 'missile') {
      let closest = MISSILE_RANGE;
      for (const obstacle of this.obstacles) {
        if (obstacle.broken) continue;
        const gap = (obstacle.wx + obstacle.w / 2 - wx) * dir;
        if (gap <= -10 || gap >= closest) continue;
        shot.target = obstacle;
        closest = gap;
      }
    }
    r.blasterPose = 8;
    r.shotKind = spec.kind;
    this.projectiles.push(shot);
    this.emit(spec.kind === 'pulse' ? 'pulse' : 'launch', r);
  }

  stepProjectiles(): void {
    for (const shot of this.projectiles) {
      const oldX = shot.wx;
      if (shot.kind === 'missile') shot.speed = Math.min(27, shot.speed + 1.3);
      shot.wx += shot.speed * shot.dir;
      shot.remaining -= shot.speed;
      if (shot.target && !shot.target.broken) shot.y += bounds(shot.target.y + shot.target.h / 2 - shot.y, -11, 11);
      const left = Math.min(oldX, shot.wx) - 6;
      const right = Math.max(oldX, shot.wx) + 6;
      let hit: Obstacle | null = null;
      let closest = Infinity;
      for (const o of this.obstacles) {
        if (o.broken || left >= o.wx + o.w || right <= o.wx || shot.y < o.y - 5 || shot.y > o.y + o.h + 5) continue;
        const distance = shot.dir > 0 ? o.wx - oldX : oldX - o.wx - o.w;
        if (distance < closest) { hit = o; closest = distance; }
      }
      if (!hit) continue;
      this.hitObstacle(hit, shot);
      shot.remaining = 0;
    }
    this.projectiles = this.projectiles.filter((shot) => shot.remaining > 0);
  }

  hitObstacle(obstacle: Obstacle, shot: Projectile): void {
    this.damageObstacle(obstacle, shot.damage, { runner: shot.runner, dir: shot.dir, kind: shot.kind, y: shot.y });
  }

  /** Damages any obstacle (walls, hazards, monsters, bosses); weapons call this. See enemies.ts. */
  damageObstacle(obstacle: Obstacle, amount: number, source: DamageSource): DamageResult {
    return damageObstacle(this, obstacle, amount, source);
  }

  breakObstacle(obstacle: Obstacle, runner: Runner, shield = false): void {
    if (onBreakObstacle(this, obstacle, runner, shield)) return; // boss: non-lethal breaks become damage
    obstacle.broken = true;
    const wall = obstacle.type === 'wall';
    if (!shield) {
      if (wall) runner.walls++;
      else runner.kills++;
      runner.bonus += wall ? 35 : 12;
    }
    const x = obstacle.wx + obstacle.w / 2;
    const y = obstacle.y + obstacle.h / 2;
    const color = shield ? GADGETS.shield.color : wall ? '#ffd878' : '#ffb172';
    this.blasts.push({ x, y, color, life: 22 });
    this.burst(x, y, 26, color, 6);
    this.burst(x, y, 12, '#fff2b0', 4);
    if (wall) {
      for (let row = 0; row < 7; row++) {
        for (const side of [-1, 1]) {
          this.debris.push({ x: x + side * 9, y: obstacle.y + row * 34 + 12, vx: side * (1.4 + Math.random() * 3.4),
            vy: -2 - Math.random() * 5, angle: 0, spin: side * (.04 + Math.random() * .16), life: 50 - row * 2 });
        }
      }
    }
    this.shake = Math.max(this.shake, wall ? 11 : 7);
    weaponsOnBreak(this, obstacle, runner, shield);
    this.emit(shield ? 'shield-hit' : wall ? 'wall-break' : 'blast', runner);
  }

  collide(r: Runner): void {
    if (r.feet > H + 12) {
      if (r.god) this.rescue(r);
      else this.kill(r, 'fall');
      return;
    }
    const a = runnerBox(r);
    for (const o of this.obstacles) {
      if (o.broken || o.type === 'wall') continue;
      if (hazardContact(this, r, o, a)) continue; // ghost passes, giant stomps
      if (r.invuln || r.god || !hazardHits(a, o)) continue;
      if (r.shield) {
        r.shield = false;
        this.breakObstacle(o, r, true);
      } else { this.kill(r, DEATH_BY_HAZARD[o.type]); return; }
    }
    const standing = r.ducking ? standingBox(r) : null;
    for (const shot of this.enemyShots) {
      if (shot.life <= 0) continue;
      const shotBox = { x: Math.min(shot.prevX, shot.x) - 5, y: shot.y - 5, w: Math.abs(shot.vx) + 10, h: 10 };
      if (!overlaps(a, shotBox)) {
        // Ducking under a shot that would have hit a standing runner.
        if (standing && !shot.dodged.includes(r) && overlaps(standing, shotBox)) {
          shot.dodged.push(r);
          this.emit('dodge', r, shot.x, shot.y);
        }
        continue;
      }
      if (r.invuln || isGhost(r)) continue;
      shot.life = 0;
      if (r.god || isGiant(r)) { this.burst(shot.x, shot.y, 10, '#fff2b0', 3); continue; }
      if (!r.shield) { this.kill(r, shot.cause ?? 'sentry-hit'); return; }
      r.shield = false;
      this.burst(shot.x, shot.y, 16, GADGETS.shield.color, 3.5);
      this.emit('shield-hit', r);
    }
    for (const pickup of this.orbs) {
      if (pickup.taken || !overlaps(a, { x: pickup.wx - pickup.r, y: pickup.y - pickup.r, w: pickup.r * 2, h: pickup.r * 2 })) continue;
      pickup.taken = true;
      if (isPowerKind(pickup.kind)) { grantPower(this, r, pickup.kind, pickup.wx, pickup.y); continue; }
      if (pickup.kind === 'shield') r.shield = true;
      else if (pickup.kind === 'boots') { r.boots = BOOTS_TICKS; r.extraJump = true; }
      else { r.bonus += 25; r.missiles = Math.min(r.maxMissiles ?? MAX_MISSILES, r.missiles + 1); weaponsOnPickup(this, r, pickup); }
      this.emit(pickup.kind === 'cell' ? 'orb' : pickup.kind, r);
      this.burst(pickup.wx, pickup.y, 17, pickup.kind === 'cell' ? '#bdff58' : GADGETS[pickup.kind].color, 3);
    }
  }

  /** God mode: a fall puts the runner back on the last safe ground (or the checkpoint) with invulnerability. */
  private rescue(r: Runner): void {
    const missiles = r.missiles;
    this.place(r, Math.max(r.safeX, r.checkpoint || r.startX));
    r.missiles = missiles;
    this.emit('respawn', r);
  }

  kill(r: Runner, cause: DeathCause): void {
    r.alive = false;
    r.shield = false;
    r.boots = 0;
    clearPowers(r);
    r.sliding = 0;
    r.respawnAt = this.tick + 55;
    this.emit(cause, r, r.x + 22, r.feet - 30);
    if (cause !== 'fall') this.burst(r.x + 22, r.feet - 30, 32, r.color, 5);
    this.shake = 11;
    this.flash = .6;
    if (!this.versus) this.frozen = true;
  }

  burst(x: number, y: number, count: number, color: string, power: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * power + .5;
      const life = 18 + Math.random() * 22;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - .7, life, max: life, size: 1 + Math.random() * 3, color });
    }
  }

  updateEffects(): void {
    this.fxTick++;
    for (const chunk of this.debris) {
      chunk.x += chunk.vx;
      chunk.y += chunk.vy;
      chunk.vy += .28;
      chunk.angle += chunk.spin;
      chunk.life--;
    }
    if (this.debris.length) this.debris = this.debris.filter((chunk) => chunk.life > 0 && chunk.y < H + 30);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += .11;
      p.life--;
    }
    for (const blast of this.blasts) blast.life--;
    if (this.particles.length) this.particles = this.particles.filter((p) => p.life > 0);
    if (this.blasts.length) this.blasts = this.blasts.filter((blast) => blast.life > 0);
    this.shake *= .85;
    this.flash = Math.max(0, this.flash - .055);
    this.riftFlash = Math.max(0, this.riftFlash - .024);
  }
}
