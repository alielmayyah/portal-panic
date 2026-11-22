import { describe, expect, it } from 'vitest';
import { applyCheat } from '../src/core/cheats';
import { GROUND_Y, LEVELS, makeHazard } from '../src/core/levels';
import type { Obstacle, Runner, WorldEvent } from '../src/core/types';
import {
  DUCK_SPEED, H, MAX_MISSILES, World, createRunner, crystalShards, duckedBox, hazardHits, rectHitsPolygon,
} from '../src/core/world';

function soloWorld(level = 0): World {
  const world = new World({ runner: createRunner(), level });
  world.runner.invuln = 0;
  return world;
}

/** An empty course so only the hazards a test adds matter. */
function clearCourse(world: World): void {
  world.obstacles = [];
  world.walls = [];
  world.orbs = [];
  world.platforms = [];
  world.surfaces = [...world.dimension.floors];
}

function toObstacle(def: ReturnType<typeof makeHazard>): Obstacle {
  return { ...def, x: def.wx, baseX: def.wx, baseY: def.y, maxHp: def.hp, charge: 0, readyAt: 0, flash: 0 };
}

function stepUntil(world: World, done: (events: WorldEvent[]) => boolean, max = 300): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < max; i++) {
    world.step();
    seen.push(...world.events.splice(0));
    if (done(seen)) break;
  }
  return seen;
}

/** Fires one sentry shot straight at a runner standing still at x = 300. */
function shotAt(world: World, r: Runner) {
  const y = r.feet - 44; // chest height of a standing runner
  world.enemyShots.push({ x: r.x + 120, prevX: r.x + 120, y, vx: -9, life: 53, dodged: [] });
}

const types = (events: WorldEvent[]) => events.map((e) => e.type);

describe('drone shots and ducking', () => {
  it('kills a standing runner with sentry-hit', () => {
    const world = soloWorld();
    clearCourse(world);
    const r = world.runner;
    r.x = 300;
    shotAt(world, r);
    const events = stepUntil(world, (e) => types(e).includes('sentry-hit'), 40);
    expect(types(events)).toContain('sentry-hit');
    expect(r.alive).toBe(false);
  });

  it('lets a ducking runner survive and emits dodge', () => {
    const world = soloWorld();
    clearCourse(world);
    const r = world.runner;
    r.x = 300;
    r.input = { duck: true };
    world.step();
    expect(r.ducking).toBe(true);
    shotAt(world, r);
    const events = stepUntil(world, () => world.enemyShots.length === 0, 60);
    expect(types(events)).toContain('dodge');
    expect(types(events).filter((t) => t === 'dodge')).toHaveLength(1);
    expect(types(events)).not.toContain('sentry-hit');
    expect(r.alive).toBe(true);
  });

  it('warns once per level when a drone starts charging', () => {
    const world = soloWorld();
    clearCourse(world);
    const drone = toObstacle(makeHazard('drone', 600, GROUND_Y, 1));
    world.obstacles = [drone];
    world.runner.x = 400;
    world.runner.god = true;
    const events = stepUntil(world, () => false, 400);
    expect(types(events).filter((t) => t === 'drone-warning')).toHaveLength(1);
    expect(types(events).filter((t) => t === 'enemy-charge').length).toBeGreaterThan(1);
    expect(events.find((e) => e.type === 'drone-warning')?.runner).toBe(world.runner);
  });
});

describe('crystals', () => {
  it('walking into a crystal emits crystal-hit', () => {
    const world = soloWorld();
    clearCourse(world);
    world.obstacles = [toObstacle(makeHazard('crystal', 400))];
    world.runner.x = 300;
    world.runner.input = { right: true };
    const events = stepUntil(world, (e) => types(e).includes('crystal-hit'), 120);
    expect(types(events)).toContain('crystal-hit');
    expect(world.runner.alive).toBe(false);
  });

  it('uses a hitbox that matches the drawn spike', () => {
    const crystal = toObstacle(makeHazard('crystal', 400));
    const [poly] = crystalShards(crystal);
    // Base corners and the tip are exactly the drawn outline.
    expect(poly![0]).toEqual([400, GROUND_Y]);
    expect(poly![2]).toEqual([400 + crystal.w * .55, GROUND_Y - crystal.h]);
    // A box just above the tip, or tucked into the empty top corner beside the spike, is safe.
    const tipX = 400 + crystal.w * .55;
    expect(hazardHits({ x: tipX - 5, y: GROUND_Y - crystal.h - 12, w: 10, h: 11 }, crystal)).toBe(false);
    expect(hazardHits({ x: 400, y: GROUND_Y - crystal.h, w: 3, h: 6 }, crystal)).toBe(false);
    // Touching the tip or the flank kills.
    expect(hazardHits({ x: tipX - 2, y: GROUND_Y - crystal.h - 5, w: 4, h: 7 }, crystal)).toBe(true);
    expect(hazardHits({ x: 395, y: GROUND_Y - 6, w: 7, h: 4 }, crystal)).toBe(true);
    // Every drawn vertex lies on or inside the hitbox and a point outside it does not hit.
    for (const [x, y] of poly!) expect(rectHitsPolygon({ x: x - .5, y: y - .5, w: 1, h: 1 }, poly!)).toBe(true);
    expect(rectHitsPolygon({ x: 400 + crystal.w + 1, y: GROUND_Y - 4, w: 3, h: 3 }, poly!)).toBe(false);
  });

  it('two-shard crystals have two spikes, the second shorter', () => {
    const crystal = toObstacle(makeHazard('crystal', 900, GROUND_Y, 1));
    const shards = crystalShards(crystal);
    expect(shards).toHaveLength(2);
    expect(shards[1]![2]![1]).toBeGreaterThan(shards[0]![2]![1]);
  });
});

describe('god mode', () => {
  it('survives a crystal', () => {
    const world = soloWorld();
    clearCourse(world);
    world.obstacles = [toObstacle(makeHazard('crystal', 400))];
    expect(applyCheat(world, 'godmode').ok).toBe(true);
    world.runner.x = 300;
    world.runner.input = { right: true };
    const events = stepUntil(world, () => world.runner.x > 480, 120);
    expect(types(events)).not.toContain('crystal-hit');
    expect(world.runner.alive).toBe(true);
    expect(world.runner.x).toBeGreaterThan(480);
  });

  it('survives a pit and lands back on safe ground', () => {
    const world = soloWorld();
    clearCourse(world);
    applyCheat(world, 'GODMODE');
    world.runner.x = 600;
    world.runner.input = { right: true };
    // Level 1 has a pit from 760 to 865.
    const events = stepUntil(world, (e) => types(e).includes('respawn'), 200);
    expect(types(events)).toContain('respawn');
    expect(types(events)).not.toContain('fall');
    const r = world.runner;
    expect(r.alive).toBe(true);
    expect(r.feet).toBe(GROUND_Y);
    expect(r.invuln).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(760);
    expect(r.feet).toBeLessThan(H);
  });

  it('without god mode the pit is a fall', () => {
    const world = soloWorld();
    clearCourse(world);
    world.runner.x = 600;
    world.runner.input = { right: true };
    const events = stepUntil(world, (e) => types(e).includes('fall'), 200);
    expect(types(events)).toContain('fall');
    expect(world.runner.alive).toBe(false);
  });
});

describe('duck slide', () => {
  it('keeps speed above duck speed for a few ticks, then decays', () => {
    const world = soloWorld();
    clearCourse(world);
    const r = world.runner;
    r.x = 200;
    r.input = { right: true };
    for (let i = 0; i < 20; i++) world.step();
    expect(r.vx).toBeCloseTo(6);
    world.events.length = 0;
    r.input = { right: true, duck: true };
    world.step();
    expect(types(world.events)).toContain('duck');
    expect(types(world.events)).toContain('slide');
    expect(r.sliding).toBeGreaterThan(0);
    const speeds: number[] = [];
    for (let i = 0; i < 8; i++) { world.step(); speeds.push(r.vx); }
    for (const v of speeds) expect(v).toBeGreaterThan(DUCK_SPEED + .2);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
    for (let i = 0; i < 30; i++) world.step();
    expect(r.sliding).toBe(0);
    expect(r.vx).toBeCloseTo(DUCK_SPEED);
    // The slide uses the ducked hitbox.
    expect(duckedBox(r).h).toBe(28);
  });

  it('a slow duck does not slide', () => {
    const world = soloWorld();
    clearCourse(world);
    world.runner.input = { duck: true };
    world.step();
    expect(types(world.events)).toContain('duck');
    expect(types(world.events)).not.toContain('slide');
    expect(world.runner.sliding).toBe(0);
  });
});

describe('cheats', () => {
  it('applies each code, case and space insensitive, and marks cheatsUsed', () => {
    const world = soloWorld();
    const r = world.runner;
    expect(world.cheatsUsed).toBe(false);

    expect(applyCheat(world, 'nope')).toEqual({ ok: false, reason: 'Unknown code' });
    expect(world.cheatsUsed).toBe(false);

    const unlock = applyCheat(world, 'unlock all');
    expect(unlock).toMatchObject({ ok: true, unlockAll: true });
    expect(world.cheatsUsed).toBe(false);

    r.missiles = 0;
    expect(applyCheat(world, ' ammo ')).toMatchObject({ ok: true, code: 'AMMO' });
    expect(r.missiles).toBe(MAX_MISSILES);
    expect(world.cheatsUsed).toBe(true);

    expect(applyCheat(world, 'God Mode')).toMatchObject({ ok: true, label: 'God mode on' });
    expect(r.god).toBe(true);
    expect(applyCheat(world, 'godmode')).toMatchObject({ ok: true, label: 'God mode off' });
    expect(r.god).toBe(false);

    applyCheat(world, 'infinite ammo');
    expect(r.infiniteAmmo).toBe(true);
    r.missiles = 0;
    r.input = { missile: true };
    world.step();
    expect(world.projectiles.some((p) => p.kind === 'missile')).toBe(true);
    expect(r.missiles).toBe(0);

    applyCheat(world, 'shield');
    expect(r.shield).toBe(true);
    applyCheat(world, 'boots');
    expect(r.boots).toBeGreaterThan(0);

    world.events.length = 0;
    expect(applyCheat(world, 'skip')).toMatchObject({ ok: true, code: 'SKIP' });
    expect(world.events).toEqual([{ type: 'portal', runner: r }]);
    expect(world.frozen).toBe(true);
    expect(world.winner).toBe(r);
  });

  it('SKIP is solo only', () => {
    const world = new World({ runner: createRunner(), rival: createRunner({ name: 'Morty', character: 'morty' }) });
    expect(applyCheat(world, 'SKIP').ok).toBe(false);
  });
});

describe('level data parity with levels.js', () => {
  const expected = [
    { floors: 4, platforms: 8, hazards: 9, pickups: 9, width: 3030, exit: 2895, checkpoint: 1470 },
    { floors: 5, platforms: 11, hazards: 12, pickups: 13, width: 3430, exit: 3280, checkpoint: 1690 },
    { floors: 6, platforms: 13, hazards: 15, pickups: 16, width: 3780, exit: 3615, checkpoint: 1725 },
  ];
  // Only the first 3 levels are ports of levels.js; tests/levels.test.ts covers the new ones.
  it('keeps the first 3 levels with the same counts', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(3);
    LEVELS.slice(0, 3).forEach((level, i) => {
      expect({
        floors: level.floors.length, platforms: level.platforms.length, hazards: level.hazards.length,
        pickups: level.pickups.length, width: level.width, exit: level.exit, checkpoint: level.checkpoint,
      }).toEqual(expected[i]);
    });
  });
  it('builds hazards like levels.js', () => {
    const counts = LEVELS.slice(0, 3).map((l) => ['wall', 'drone', 'slime', 'crystal'].map((t) => l.hazards.filter((h) => h.type === t).length));
    expect(counts).toEqual([[2, 2, 2, 3], [2, 3, 4, 3], [3, 5, 3, 4]]);
    expect(LEVELS[0]!.hazards[1]).toEqual({ type: 'crystal', wx: 623, w: 29, h: 39, y: 301, shards: 1, tint: .21, hp: 1 });
  });
});
