import { describe, expect, it } from 'vitest';
import { GROUND_Y, LEVELS } from '../src/core/levels';
import { MONSTER_TYPES, isMonsterType } from '../src/core/enemies';
import { POWER_KINDS } from '../src/core/powers';
import type { LevelDef } from '../src/core/types';
import { RUN_SPEED, World, createRunner } from '../src/core/world';

// ---------- Jump model ----------
// Mirrors World.stepRunner: a held jump starts at JUMP_V and gravity is added before each move.
const JUMP_V = -15.7;
const GRAVITY = .84;
/** Runner x range that still stands on a surface: x + 34 > s.x && x + 10 < s.x + s.w. */
const FOOT_LEFT = 10, FOOT_RIGHT = 34;
/** Safety margin on horizontal reach (the runner needs a few ticks to reach full speed). */
const REACH_MARGIN = .85;

/** Feet offsets (relative to the take-off height, negative = up) per tick of a held jump. */
function jumpArc(ticks = 160): number[] {
  const arc = [0];
  let vy = JUMP_V, feet = 0;
  for (let t = 1; t <= ticks; t++) { vy += GRAVITY; feet += vy; arc.push(feet); }
  return arc;
}
const ARC = jumpArc();
const APEX = -Math.min(...ARC);

/** Ticks until a held jump lands on a surface `rise` units above the take-off height (Infinity if too high). */
function landingTick(rise: number): number {
  for (let t = 1; t < ARC.length; t++) {
    const descending = ARC[t]! > ARC[t - 1]!;
    if (descending && ARC[t - 1]! <= -rise + .5 && ARC[t]! >= -rise) return t;
  }
  return Infinity;
}

interface Node { name: string; x: number; w: number; top: number; bottom: number }

/** Floors and platforms. A moving platform spans its travel: best case is used for each jump. */
function nodes(level: LevelDef): Node[] {
  return [
    ...level.floors.map((f, i) => ({ name: `floor ${i} @${f.x}`, x: f.x, w: f.w, top: f.y, bottom: f.y })),
    ...level.platforms.map((p, i) => ({ name: `platform ${i} @${p.x}`, x: p.x, w: p.w, top: p.y - p.travel, bottom: p.y + p.travel })),
  ];
}

/** Can a runner standing on `a` jump (or walk off and fall) onto `b`? */
function canReach(a: Node, b: Node): boolean {
  // Best case: take off from a's highest point, land on b's lowest point.
  const rise = a.top - b.bottom;
  if (rise > APEX - 1) return false;
  const t = landingTick(rise);
  if (!Number.isFinite(t)) return false;
  const aMin = a.x - FOOT_RIGHT, aMax = a.x + a.w - FOOT_LEFT;
  const bMin = b.x - FOOT_RIGHT, bMax = b.x + b.w - FOOT_LEFT;
  const distance = Math.max(0, bMin - aMax, aMin - bMax);
  return distance <= RUN_SPEED * t * REACH_MARGIN;
}

/** Breadth-first search over the jump graph from the start floor. */
function reachable(level: LevelDef): Set<string> {
  const all = nodes(level);
  const start = all.find((n) => n.top === GROUND_Y && n.x <= 90 && n.x + n.w > 134)!;
  const seen = new Set<string>([start.name]);
  const queue = [start];
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of all) if (!seen.has(b.name) && canReach(a, b)) { seen.add(b.name); queue.push(b); }
  }
  return seen;
}

const floorAt = (level: LevelDef, x: number, margin = 0) =>
  level.floors.find((f) => x >= f.x + margin && x <= f.x + f.w - margin);

describe('jump model', () => {
  it('matches the real World jump apex and air time', () => {
    const world = new World({ runner: createRunner(), level: 0 });
    world.obstacles = []; world.walls = []; world.orbs = []; world.platforms = [];
    world.surfaces = [{ x: 0, w: 5000, y: GROUND_Y }];
    const r = world.runner;
    r.input = { jump: true };
    let top = GROUND_Y, air = 0;
    for (let i = 0; i < 120; i++) {
      world.step();
      top = Math.min(top, r.feet);
      if (!r.grounded) air++;
      else if (air) break;
    }
    expect(GROUND_Y - top).toBeCloseTo(APEX, 0);
    // The landing step itself counts as grounded.
    expect(air + 1).toBe(landingTick(0));
  });

  it('rejects gaps that are too wide and ledges that are too high', () => {
    const a: Node = { name: 'a', x: 0, w: 500, top: GROUND_Y, bottom: GROUND_Y };
    const far = (gap: number): Node => ({ name: 'b', x: 500 + gap, w: 300, top: GROUND_Y, bottom: GROUND_Y });
    expect(canReach(a, far(180))).toBe(true);
    expect(canReach(a, far(300))).toBe(false);
    const ledge = (y: number): Node => ({ name: 'c', x: 520, w: 100, top: y, bottom: y });
    expect(canReach(a, ledge(GROUND_Y - 100))).toBe(true);
    expect(canReach(a, ledge(GROUND_Y - 150))).toBe(false);
    // A runner can always drop back down.
    expect(canReach(ledge(GROUND_Y - 100), a)).toBe(true);
  });
});

describe('levels', () => {
  it('has at least 8 levels and keeps the first three', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(8);
    expect(LEVELS.slice(0, 3).map((l) => l.code)).toEqual(['C-137', 'J-19ζ7', 'C-500A']);
  });

  it('gives every level a unique code, name, palette and a known skyline', () => {
    expect(new Set(LEVELS.map((l) => l.code)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.sky + l.haze + l.rim)).size).toBe(LEVELS.length);
    for (const l of LEVELS) {
      expect(['ridges', 'towers', 'spires', 'neon', 'swamp', 'islands', 'lair']).toContain(l.skyline);
      expect(l.bass.length).toBe(8);
      expect(l.beat).toBeGreaterThan(.15);
    }
    // New levels each bring a new skyline style.
    expect(new Set(LEVELS.slice(3).map((l) => l.skyline)).size).toBe(LEVELS.length - 3);
  });

  it('gets faster and longer after the first three', () => {
    for (let i = 3; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.width).toBeGreaterThanOrEqual(LEVELS[2]!.width - 200);
      expect(LEVELS[i]!.beat).toBeLessThanOrEqual(LEVELS[0]!.beat);
    }
  });

  for (const [index, level] of LEVELS.entries()) {
    describe(`${index + 1}. ${level.name}`, () => {
      it('has ordered, non-overlapping floors from 0 to the level width', () => {
        expect(level.floors[0]!.x).toBe(0);
        expect(level.floors.at(-1)!.x + level.floors.at(-1)!.w).toBe(level.width);
        for (let i = 1; i < level.floors.length; i++) {
          const prev = level.floors[i - 1]!, floor = level.floors[i]!;
          expect(floor.x, `floor ${i}`).toBeGreaterThan(prev.x + prev.w);
        }
      });

      it('puts the checkpoint and exit on solid ground, in order', () => {
        expect(floorAt(level, level.checkpoint, 20), 'checkpoint floor').toBeDefined();
        expect(floorAt(level, level.exit, 30), 'exit floor').toBeDefined();
        expect(level.checkpoint).toBeGreaterThan(level.width * .3);
        expect(level.checkpoint).toBeLessThan(level.exit);
        expect(level.exit).toBeLessThanOrEqual(level.width - 60);
      });

      it('rests walls, crystals and slimes on a floor or a platform', () => {
        const ground = [...level.floors, ...level.platforms];
        for (const h of level.hazards) {
          if (h.type !== 'wall' && h.type !== 'crystal' && h.type !== 'slime') continue;
          const reach = h.patrol && h.type === 'slime' ? h.patrol : 0;
          const base = ground.find((s) => Math.abs(s.y - (h.y + h.h)) < .5 && h.wx - reach >= s.x - 4 && h.wx + reach + h.w <= s.x + s.w + 4);
          expect(base, `${h.type} @${h.wx}`).toBeDefined();
        }
      });

      it('keeps pickups inside the level with known kinds', () => {
        const kinds = ['cell', 'shield', 'boots', ...POWER_KINDS];
        for (const p of level.pickups) {
          expect(kinds).toContain(p.kind);
          expect(p.wx).toBeGreaterThan(0);
          expect(p.wx).toBeLessThan(level.width);
          expect(p.y).toBeGreaterThan(150);
          expect(p.y).toBeLessThan(GROUND_Y);
        }
      });

      it('makes every floor and platform reachable with a normal jump', () => {
        const seen = reachable(level);
        const missing = nodes(level).filter((n) => !seen.has(n.name)).map((n) => n.name);
        expect(missing).toEqual([]);
      });
    });
  }

  it('gives every new level a moving platform, a power-up and gadgets', () => {
    for (const level of LEVELS.slice(3)) {
      expect(level.platforms.some((p) => p.travel > 0), level.name).toBe(true);
      expect(level.pickups.some((p) => (POWER_KINDS as readonly string[]).includes(p.kind)), level.name).toBe(true);
      expect(level.pickups.some((p) => p.kind === 'shield'), level.name).toBe(true);
      expect(level.pickups.some((p) => p.kind === 'boots'), level.name).toBe(true);
    }
  });

  it('keeps ground monster leashes over solid ground', () => {
    for (const level of LEVELS) {
      for (const h of level.hazards) {
        if (!isMonsterType(h.type) || h.type === 'swooper') continue;
        const reach = h.range ?? 0;
        const lo = h.wx - reach;
        const hi = h.type === 'boss' ? h.wx + h.w : h.wx + reach + h.w;
        const floor = level.floors.find((f) => Math.abs(f.y - (h.y + h.h)) < .5 && lo >= f.x && hi <= f.x + f.w);
        expect(floor, `${level.name}: ${h.type} @${h.wx}`).toBeDefined();
      }
    }
  });

  it('places the new monsters and the bosses', () => {
    const types = new Set(LEVELS.slice(3).flatMap((l) => l.hazards.map((h) => h.type)));
    for (const t of MONSTER_TYPES) expect(types, t).toContain(t);
    LEVELS.forEach((level, i) => {
      const bosses = level.hazards.filter((h) => h.type === 'boss');
      if (i === 3) expect(bosses.map((b) => b.variant)).toEqual([0]);
      else if (i === LEVELS.length - 1) expect(bosses.map((b) => b.variant)).toEqual([1]);
      else expect(bosses, level.name).toEqual([]);
      for (const boss of bosses) {
        const lead = level.exit - boss.wx;
        expect(lead).toBeGreaterThanOrEqual(250);
        expect(lead).toBeLessThanOrEqual(450);
        // No walls inside the boss arena.
        const lo = boss.wx - (boss.range ?? 0);
        expect(level.hazards.filter((h) => h.type === 'wall' && h.wx + h.w > lo && h.wx < level.exit)).toEqual([]);
      }
    });
    // The first three levels stay monster-free (parity with levels.js).
    for (const level of LEVELS.slice(0, 3)) expect(level.hazards.some((h) => isMonsterType(h.type))).toBe(false);
    // Every new level has at least three monsters.
    for (const level of LEVELS.slice(3)) expect(level.hazards.filter((h) => isMonsterType(h.type)).length).toBeGreaterThanOrEqual(3);
  });

  it('loads every level in the World', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const world = new World({ runner: createRunner(), level: i });
      expect(world.dimension).toBe(LEVELS[i]);
      expect(Boolean(world.boss), `boss on level ${i + 1}`).toBe(i === 3 || i === LEVELS.length - 1);
      world.runner.god = true;
      for (let t = 0; t < 120; t++) world.step();
      expect(world.runner.alive).toBe(true);
    }
  });
});
