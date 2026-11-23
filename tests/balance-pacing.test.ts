// Pins the pacing balance pass: level difficulty curve, checkpoints, power placement, powers vs bosses,
// drone telegraphs and versus fairness.
import { describe, expect, it } from 'vitest';
import { BOSS_CONTACT_DAMAGE, isMonsterType } from '../src/core/enemies';
import { GROUND_Y, LEVELS, makeHazard, makePickup } from '../src/core/levels';
import {
  BOSS_FREEZE_TICKS, POWERS, POWER_KINDS, TURBO_SPEED, TURBO_SPEED_VERSUS, bossFrozen, grantPower, hasPower, powerTicks, speedScale,
  stepWorldPowers,
} from '../src/core/powers';
import type { HazardDef, LevelDef, Obstacle, WorldEvent } from '../src/core/types';
import { World, createRunner, standingBox } from '../src/core/world';

// ---------- Difficulty score ----------
// Weighted hazards and monsters per 1000 units (scaled by the per-level speed-ups in world.ts), a gap term,
// the longest stretch replayed on death, a boss term, minus shields and powers.
const BOSS_WAKE = 640;
const hazardWeight = (h: HazardDef): number => {
  if (h.type === 'crystal') return h.shards === 2 ? 1.3 : 1;
  if (h.type === 'slime') return 1 + (h.patrol ?? 0) / 60;
  if (h.type === 'drone') return 1.2 + .4 * (h.volley ?? 0);
  if (h.type === 'wall') return .3 + .1 * h.hp;
  return 0;
};
const MONSTER_WEIGHT: Record<string, number> = { hopper: 1.5, swooper: 1.5, spitter: 2, brute: 2.5, splitter: 2 };
const monsterWeight = (h: HazardDef) => (MONSTER_WEIGHT[h.type] ?? 0) + ((h.type === 'spitter' || h.type === 'swooper') && h.variant ? .5 : 0);

function difficulty(l: LevelDef, i: number): number {
  const len = l.exit / 1000;
  const haz = l.hazards.filter((h) => !isMonsterType(h.type)).reduce((s, h) => s + hazardWeight(h), 0) / len;
  const mon = l.hazards.filter((h) => isMonsterType(h.type) && h.type !== 'boss').reduce((s, h) => s + monsterWeight(h), 0) / len;
  const boss = l.hazards.find((h) => h.type === 'boss');
  const powers = l.pickups.filter((p) => (POWER_KINDS as readonly string[]).includes(p.kind)).length;
  const shields = l.pickups.filter((p) => p.kind === 'shield').length;
  const seg = Math.max(l.checkpoint, l.exit - l.checkpoint) / 1000;
  return (haz + mon) * (1 + i * .06) + seg * .8 + (boss ? (boss.variant ? 3 : 2) : 0) - (shields * .35 + powers * .15) / len;
}

describe('level pacing', () => {
  const scores = LEVELS.map(difficulty);

  it('rises smoothly from gentle levels 1-2 to the final level', () => {
    expect(scores[0]).toBeLessThan(5.5);
    expect(scores[1]).toBeLessThan(7);
    for (let i = 1; i < scores.length; i++) {
      const step = scores[i]! - scores[i - 1]!;
      expect(step, `level ${i} -> ${i + 1}`).toBeGreaterThan(.8);
      expect(step, `level ${i} -> ${i + 1}`).toBeLessThan(1.8);
    }
  });

  it('puts checkpoints near the midpoint, or just outside the boss wake radius on boss levels', () => {
    for (const l of LEVELS) {
      const boss = l.hazards.find((h) => h.type === 'boss');
      const frac = l.checkpoint / l.exit;
      if (!boss) {
        expect(frac, l.name).toBeGreaterThan(.42);
        expect(frac, l.name).toBeLessThan(.58);
        continue;
      }
      const arena = boss.wx - (boss.range ?? 0);
      const wakeAt = boss.wx + boss.w / 2 - BOSS_WAKE;
      // Respawning at the checkpoint must not wake the boss, and should leave a short walk to it.
      expect(l.checkpoint + 22, l.name).toBeLessThan(wakeAt);
      expect(arena - l.checkpoint, l.name).toBeLessThan(500);
      expect(frac, l.name).toBeGreaterThan(.6);
    }
  });

  it('keeps the respawn point clear of hazards and monster aggro', () => {
    for (const l of LEVELS) {
      for (const h of l.hazards) {
        const centre = h.wx + h.w / 2;
        // Swoopers dive at anything within 330; bodies must not touch the respawn point. Drone and spitter
        // shots are covered by the 76-tick respawn invulnerability (windup >= 30 + flight).
        const reach = h.type === 'swooper' ? 330 : 60;
        if (h.type === 'wall' || h.type === 'boss' || h.type === 'drone') continue;
        expect(Math.abs(centre - (l.checkpoint + 22)), `${l.name}: ${h.type} @${h.wx}`).toBeGreaterThan(reach);
      }
    }
  });

  it('offers a power pickup before every boss', () => {
    for (const l of LEVELS) {
      const boss = l.hazards.find((h) => h.type === 'boss');
      if (!boss) continue;
      expect(l.pickups.some((p) => (POWER_KINDS as readonly string[]).includes(p.kind) && p.wx < boss.wx), l.name).toBe(true);
    }
  });

  it('keeps the first three levels at their known power-cell counts (economy)', () => {
    expect(LEVELS.slice(0, 3).map((l) => l.pickups.filter((p) => p.kind === 'cell').length)).toEqual([7, 10, 13]);
  });
});

// ---------- Powers vs bosses ----------

function bossWorld(level: number) {
  const world = new World({ runner: createRunner(), level });
  const boss = world.obstacles.find((o) => o.type === 'boss')!;
  world.runner.invuln = 0;
  return { world, boss, r: world.runner };
}
const bossBody = (o: Obstacle) => ({ x: o.wx, y: o.y, w: o.w, h: o.h });
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('powers vs bosses', () => {
  it('a ghost is shoved out of a boss instead of standing inside it', () => {
    for (const level of [3, 7]) {
      const { world, boss, r } = bossWorld(level);
      world.place(r, boss.wx + boss.w / 2 - 22);
      r.invuln = 0;
      grantPower(world, r, 'ghost');
      let inside = 0;
      for (let t = 0; t < POWERS.ghost.ticks - 5; t++) {
        r.input = { right: r.x + 22 < boss.wx + boss.w / 2, left: r.x + 22 >= boss.wx + boss.w / 2 };
        world.step();
        if (overlap(standingBox(r), bossBody(boss))) inside++;
      }
      expect(r.alive).toBe(true);
      expect(inside).toBeLessThan(10);
    }
  });

  it('a giant gets one stomp on a boss, then shrinks back', () => {
    const { world, boss, r } = bossWorld(7);
    world.place(r, boss.wx - 80);
    r.invuln = 0;
    grantPower(world, r, 'giant');
    const hp = boss.hp;
    const events: WorldEvent[] = [];
    for (let t = 0; t < 120; t++) {
      r.input = { right: true };
      world.step();
      events.push(...world.events.splice(0));
    }
    expect(events.filter((e) => e.type === 'stomp')).toHaveLength(1);
    expect(hasPower(r, 'giant')).toBe(false);
    // One stomp's worth of damage (enemies.ts owns the amount).
    expect(hp - boss.hp).toBeLessThanOrEqual(BOSS_CONTACT_DAMAGE.stomp);
  });

  it('keeps durations worth picking up but short of a whole boss fight', () => {
    for (const kind of POWER_KINDS) {
      expect(POWERS[kind].ticks, kind).toBeGreaterThanOrEqual(4 * 60);
      expect(POWERS[kind].ticks, kind).toBeLessThanOrEqual(10 * 60);
    }
    expect(POWERS.rapid.ticks).toBeLessThanOrEqual(7 * 60);
  });

  it('bossFrozen only holds for the start of a freeze', () => {
    const { world, r } = bossWorld(3);
    grantPower(world, r, 'freeze');
    let held = 0;
    for (let t = 0; t < POWERS.freeze.ticks; t++) {
      stepWorldPowers(world);
      if (bossFrozen(world)) held++;
      r.powers!.freeze = POWERS.freeze.ticks - t;
    }
    expect(held).toBe(BOSS_FREEZE_TICKS);
  });
});

// ---------- Hazard telegraphs ----------

it('drones wind up for at least 30 ticks on every level', () => {
  for (let level = 0; level < LEVELS.length; level++) {
    const world = new World({ runner: createRunner(), level });
    const def = makeHazard('drone', 600, GROUND_Y, 1);
    world.obstacles = [{ ...def, x: def.wx, baseX: def.wx, baseY: def.y, maxHp: def.hp, charge: 0, readyAt: 0, flash: 0 }];
    world.walls = []; world.orbs = []; world.platforms = [];
    world.surfaces = [{ x: 0, w: 5000, y: GROUND_Y }];
    world.runner.god = true;
    world.place(world.runner, 380);
    let charge = 0;
    for (let t = 0; t < 30 && !charge; t++) { world.step(); charge = world.obstacles[0]!.charge; }
    expect(charge, `level ${level + 1}`).toBeGreaterThanOrEqual(30);
  }
});

// ---------- Versus fairness ----------

function versus(level = 0): World {
  const world = new World({ runner: createRunner(), rival: createRunner({ name: 'Morty', character: 'morty' }), level });
  return world;
}

describe('versus fairness', () => {
  it('splits tied pickups between two racers with identical inputs', () => {
    const world = versus();
    world.obstacles = []; world.walls = []; world.platforms = [];
    world.surfaces = [{ x: 0, w: 5000, y: GROUND_Y }];
    world.orbs = Array.from({ length: 24 }, (_, i) => ({ ...makePickup(300 + i * 53, 310) }));
    const wins = [0, 0];
    for (let t = 0; t < 400; t++) {
      for (const r of world.runners) r.input = { right: true };
      world.step();
      for (const e of world.events.splice(0)) if (e.type === 'orb' && e.runner) wins[world.runners.indexOf(e.runner)]!++;
    }
    expect(wins[0]! + wins[1]!).toBe(24);
    expect(Math.min(...wins)).toBeGreaterThanOrEqual(8);
  });

  it('the regroup warp never puts the trailer ahead of the leader', () => {
    for (const [index, level] of LEVELS.entries()) {
      const world = versus(index);
      const [a, b] = world.runners as [ReturnType<typeof createRunner>, ReturnType<typeof createRunner>];
      for (const f of level.floors) {
        for (let x = f.x + 20; x < f.x + f.w - 50; x += 90) {
          if (x < world.regroupGap + 40) continue;
          world.place(a, x);
          world.place(b, x - world.regroupGap - 20);
          b.lagTicks = 74;
          world.keepRacersTogether();
          expect(b.x, `${level.name} lead @${x}`).toBeLessThan(a.x);
          expect(level.floors.some((g) => b.x + 34 > g.x && b.x + 10 < g.x + g.w), `${level.name} lead @${x}`).toBe(true);
          expect(b.invuln).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('turbo is milder and shorter in versus', () => {
    const world = versus();
    const r = world.runner;
    grantPower(world, r, 'turbo');
    expect(powerTicks(r, 'turbo')).toBe(6 * 60);
    expect(speedScale(r, true)).toBe(TURBO_SPEED_VERSUS);
    expect(speedScale(r)).toBe(TURBO_SPEED);
    const solo = new World({ runner: createRunner(), level: 0 });
    grantPower(solo, solo.runner, 'turbo');
    expect(powerTicks(solo.runner, 'turbo')).toBe(POWERS.turbo.ticks);
  });
});
