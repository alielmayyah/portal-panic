import { describe, expect, it } from 'vitest';
import { makeHazard, makePickup } from '../src/core/levels';
import {
  POWERS, POWER_EVENT_SOUNDS, POWER_KINDS, cooldownScale, enemyClock, grantPower, hasPower, isFrozen, isPowerKind,
  magnetPull, monsterContact, powerHitbox, powerStatus, powerTicks, shotImmune, withPowerStatus,
} from '../src/core/powers';
import type { Obstacle, PowerKind, Runner, WorldEvent } from '../src/core/types';
import { EFFECTS } from '../src/audio/sound';
import { RUN_SPEED, World, createRunner, standingBox } from '../src/core/world';

function soloWorld(): World {
  const world = new World({ runner: createRunner(), level: 0 });
  world.runner.invuln = 0;
  world.obstacles = [];
  world.walls = [];
  world.orbs = [];
  world.platforms = [];
  world.surfaces = [...world.dimension.floors];
  return world;
}

function versusWorld(): World {
  const world = new World({ runner: createRunner(), rival: createRunner({ name: 'Morty', character: 'morty', x: 140 }), level: 0 });
  for (const r of world.runners) r.invuln = 0;
  world.obstacles = [];
  world.walls = [];
  world.orbs = [];
  world.platforms = [];
  world.surfaces = [...world.dimension.floors];
  return world;
}

const toObstacle = (def: ReturnType<typeof makeHazard>): Obstacle =>
  ({ ...def, x: def.wx, baseX: def.wx, baseY: def.y, maxHp: def.hp, charge: 0, readyAt: 0, flash: 0 });

function run(world: World, ticks: number): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) { world.step(); seen.push(...world.events.splice(0)); }
  return seen;
}
const types = (events: WorldEvent[]) => events.map((e) => e.type);
const give = (world: World, r: Runner, kind: PowerKind) => grantPower(world, r, kind);

describe('power catalogue', () => {
  it('has at least 5 powers, each with a pickup sound effect', () => {
    expect(POWER_KINDS.length).toBeGreaterThanOrEqual(5);
    for (const sound of Object.values(POWER_EVENT_SOUNDS)) expect(EFFECTS as readonly string[]).toContain(sound);
    for (const kind of POWER_KINDS) {
      expect(isPowerKind(kind)).toBe(true);
      expect(POWERS[kind].ticks).toBeGreaterThan(0);
    }
    expect(isPowerKind('cell')).toBe(false);
    expect(isPowerKind('shield')).toBe(false);
  });

  it('declares power pickups with makePickup and collects them in the world', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    world.orbs = [{ ...makePickup(322, 310, 'turbo') }];
    expect(world.orbs[0]!.r).toBe(14);
    const events = run(world, 2);
    expect(types(events)).toContain('turbo');
    expect(world.orbs[0]!.taken).toBe(true);
    expect(powerTicks(r, 'turbo')).toBeGreaterThan(POWERS.turbo.ticks - 3);
  });
});

describe('timers', () => {
  it('counts down, emits power-end, and repicking refreshes', () => {
    const world = soloWorld();
    const r = world.runner;
    give(world, r, 'rapid');
    run(world, 100);
    expect(powerTicks(r, 'rapid')).toBe(POWERS.rapid.ticks - 100);
    give(world, r, 'rapid');
    expect(powerTicks(r, 'rapid')).toBe(POWERS.rapid.ticks);
    const events = run(world, POWERS.rapid.ticks);
    expect(types(events)).toContain('power-end');
    expect(hasPower(r, 'rapid')).toBe(false);
  });

  it('death and respawn clear timed powers', () => {
    const world = versusWorld();
    const [r] = world.runners as [Runner, Runner];
    give(world, r, 'turbo');
    give(world, r, 'magnet');
    world.kill(r, 'fall');
    expect(powerStatus(r)).toBe('');
    run(world, 80);
    expect(r.alive).toBe(true);
    expect(hasPower(r, 'turbo')).toBe(false);
  });

  it('loading a level clears powers', () => {
    const world = soloWorld();
    give(world, world.runner, 'giant');
    world.loadLevel(0);
    expect(hasPower(world.runner, 'giant')).toBe(false);
  });

  it('powers are per runner in versus', () => {
    const world = versusWorld();
    const [a, b] = world.runners as [Runner, Runner];
    give(world, a, 'ghost');
    expect(hasPower(a, 'ghost')).toBe(true);
    expect(hasPower(b, 'ghost')).toBe(false);
  });
});

describe('turbo', () => {
  it('raises run speed and jump height', () => {
    const plain = soloWorld();
    const fast = soloWorld();
    give(fast, fast.runner, 'turbo');
    for (const w of [plain, fast]) w.runner.input = { right: true };
    run(plain, 30);
    run(fast, 30);
    expect(plain.runner.vx).toBeCloseTo(RUN_SPEED);
    expect(fast.runner.vx).toBeGreaterThan(RUN_SPEED * 1.3);

    const apex = (w: World) => {
      w.runner.input = { jump: true };
      let top = w.runner.feet;
      for (let i = 0; i < 40; i++) { w.step(); top = Math.min(top, w.runner.feet); }
      return top;
    };
    const a = soloWorld();
    const b = soloWorld();
    give(b, b.runner, 'turbo');
    expect(apex(b)).toBeLessThan(apex(a) - 20);
  });
});

describe('rapid fire', () => {
  it('halves the blaster cooldown', () => {
    const count = (rapid: boolean) => {
      const world = soloWorld();
      if (rapid) give(world, world.runner, 'rapid');
      world.runner.input = { fire: true };
      return types(run(world, 120)).filter((t) => t === 'pulse').length;
    };
    const normal = count(false);
    const fast = count(true);
    expect(fast).toBeGreaterThanOrEqual(normal * 2 - 1);
    expect(cooldownScale({ powers: { rapid: 5 } })).toBe(.5);
  });
});

describe('magnet', () => {
  it('pulls nearby cells into the runner', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    world.orbs = [{ ...makePickup(500, 250, 'cell') }, { ...makePickup(900, 250, 'cell') }];
    give(world, r, 'magnet');
    const events = run(world, 60);
    expect(types(events)).toContain('orb');
    expect(world.orbs[0]!.taken).toBe(true);
    expect(world.orbs[1]!.taken).toBeFalsy(); // out of range
  });
});

describe('time freeze', () => {
  it('stops patrolling hazards, sentries and enemy shots, then resumes smoothly', () => {
    const world = soloWorld();
    const r = world.runner;
    const slime = toObstacle(makeHazard('slime', 700, undefined, 60));
    world.obstacles = [slime];
    world.enemyShots.push({ x: 600, prevX: 600, y: 200, vx: -9, life: 53, dodged: [] });
    give(world, r, 'freeze');
    expect(isFrozen(world)).toBe(true);
    run(world, 1);
    const wx = slime.wx;
    const shotX = world.enemyShots[0]!.x;
    const clock = enemyClock(world);
    run(world, 100);
    expect(slime.wx).toBe(wx);
    expect(world.enemyShots[0]!.x).toBe(shotX);
    expect(enemyClock(world)).toBe(clock);
    run(world, POWERS.freeze.ticks);
    expect(isFrozen(world)).toBe(false);
    const before = slime.wx;
    run(world, 1);
    expect(Math.abs(slime.wx - before)).toBeLessThan(5); // no jump after unfreezing
  });
});

describe('ghost', () => {
  it('passes through crystals and enemy shots', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    world.obstacles = [toObstacle(makeHazard('crystal', 360))];
    world.enemyShots.push({ x: 420, prevX: 420, y: r.feet - 44, vx: -9, life: 53, dodged: [] });
    give(world, r, 'ghost');
    r.input = { right: true };
    const events = run(world, 30);
    expect(r.alive).toBe(true);
    expect(types(events)).not.toContain('crystal-hit');
    expect(types(events)).not.toContain('sentry-hit');
    expect(shotImmune(r)).toBe(true);
  });

  it('gives a short grace period when ghost ends', () => {
    const world = soloWorld();
    const r = world.runner;
    give(world, r, 'ghost');
    r.powers!.ghost = 1;
    run(world, 1);
    expect(r.invuln).toBeGreaterThan(0);
  });
});

describe('giant', () => {
  it('stomps hazards on contact for a kill bonus', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    const slime = toObstacle(makeHazard('slime', 380));
    world.obstacles = [slime];
    give(world, r, 'giant');
    r.input = { right: true };
    const events = run(world, 20);
    expect(r.alive).toBe(true);
    expect(slime.broken).toBe(true);
    expect(types(events)).toContain('stomp');
    expect(r.kills).toBe(1);
  });

  it('doubles the contact box around the feet', () => {
    const r = createRunner();
    const box = standingBox(r);
    const big = powerHitbox({ powers: { giant: 10 } }, box);
    expect(big.w).toBe(box.w * 2);
    expect(big.h).toBe(box.h * 2);
    expect(big.y + big.h).toBe(box.y + box.h);
  });

  it('shrugs off enemy shots', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    world.enemyShots.push({ x: 420, prevX: 420, y: r.feet - 44, vx: -9, life: 53, dodged: [] });
    give(world, r, 'giant');
    run(world, 30);
    expect(r.alive).toBe(true);
    expect(world.enemyShots.length).toBe(0);
  });
});

describe('generic monster hooks', () => {
  it('monsterContact: pass for ghost, stomp for giant, null otherwise', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    const box = { x: 320, y: r.feet - 40, w: 30, h: 30 };
    expect(monsterContact(world, r, box)).toBeNull();
    give(world, r, 'ghost');
    expect(monsterContact(world, r, box)).toBe('pass');
    r.powers = {};
    give(world, r, 'giant');
    world.events.length = 0;
    expect(monsterContact(world, r, box)).toBe('stomp');
    expect(types(world.events)).toContain('stomp');
    expect(monsterContact(world, r, { x: 2000, y: 0, w: 10, h: 10 })).toBe('pass');
  });
});

describe('HUD status', () => {
  it('lists active powers with seconds left', () => {
    const r = createRunner();
    expect(powerStatus(r)).toBe('');
    r.powers = { turbo: 360, ghost: 61 };
    expect(powerStatus(r)).toBe('Turbo 6s · Ghost 2s');
    expect(withPowerStatus('Shield ready', r)).toBe('Shield ready · Turbo 6s · Ghost 2s');
    expect(withPowerStatus('', r)).toBe('Turbo 6s · Ghost 2s');
    r.alive = false;
    expect(withPowerStatus('Respawning…', r)).toBe('Respawning…');
  });
});

describe('magnetPull (generic, for coin drops)', () => {
  it('moves an item toward a magnet runner in range only', () => {
    const world = soloWorld();
    const r = world.runner;
    r.x = 300;
    const near = { x: 450, y: r.feet - 30 };
    const far = { x: 1200, y: 100 };
    expect(magnetPull(world, near)).toBe(false);
    give(world, r, 'magnet');
    expect(magnetPull(world, near)).toBe(true);
    expect(near.x).toBeLessThan(450);
    expect(magnetPull(world, far)).toBe(false);
  });
});
