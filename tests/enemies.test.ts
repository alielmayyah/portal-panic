import { describe, expect, it } from 'vitest';
import {
  BOSS_CONTACT_DAMAGE, BOSS_NAMES, BOSS_STATS, MONSTER_DEATHS, MONSTER_TYPES, OFFSCREEN, SWOOP_CLEARANCE, bossHud, makeMonster, portalSealed,
} from '../src/core/enemies';
import { GROUND_Y, LEVELS } from '../src/core/levels';
import type { HazardDef, LevelDef, MonsterType, Obstacle, Runner, WorldEvent } from '../src/core/types';
import { DEATH_EVENTS, World, createRunner, duckedBox, hazardBox, isDeathEvent, overlaps, standingBox } from '../src/core/world';

/** Appends a flat test level with the given hazards and returns its index. */
function testLevel(hazards: HazardDef[], extra: Partial<LevelDef> = {}): number {
  const base = LEVELS[0]!;
  const level: LevelDef = {
    ...base, code: 'T-1', name: 'Test', width: 6000, checkpoint: 400, exit: 5800,
    floors: [{ x: 0, w: 6000, y: GROUND_Y }], platforms: [], pickups: [], hazards, ...extra,
  };
  (LEVELS as LevelDef[]).push(level);
  return LEVELS.length - 1;
}

function solo(hazards: HazardDef[], extra: Partial<LevelDef> = {}): World {
  const w = new World({ runner: createRunner(), level: testLevel(hazards, extra) });
  w.runner.invuln = 0;
  return w;
}

function versus(hazards: HazardDef[]): World {
  const w = new World({ runner: createRunner(), rival: createRunner({ name: 'Morty', character: 'morty' }), level: testLevel(hazards) });
  for (const r of w.runners) r.invuln = 0;
  return w;
}

function run(w: World, ticks: number, each?: (w: World) => void): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    each?.(w);
    w.step();
    seen.push(...w.events.splice(0));
  }
  return seen;
}

const mob = (w: World, type: MonsterType): Obstacle => w.obstacles.find((o) => o.type === type && !o.mob?.spawned)!;
const park = (r: Runner, x: number) => { r.x = x; r.feet = GROUND_Y; r.vx = 0; r.vy = 0; r.input = {}; };

describe('monster definitions', () => {
  it('has at least 4 monster types plus a boss, each with hp and a death cause', () => {
    expect(MONSTER_TYPES.filter((t) => t !== 'boss').length).toBeGreaterThanOrEqual(4);
    for (const type of MONSTER_TYPES) {
      const def = makeMonster(type, 500);
      expect(def.type).toBe(type);
      expect(def.hp).toBeGreaterThan(0);
      expect(isDeathEvent(`${type}-hit`)).toBe(true);
    }
    expect(DEATH_EVENTS).toEqual(expect.arrayContaining(MONSTER_DEATHS));
  });

  it('places ground monsters on their floor', () => {
    for (const type of ['hopper', 'spitter', 'brute', 'splitter', 'boss'] as const) {
      const def = makeMonster(type, 500, 300);
      expect(def.y + def.h).toBe(300);
    }
  });
});

describe('monster contact', () => {
  it.each(['hopper', 'spitter', 'brute', 'splitter', 'boss'] as const)('%s kills on contact with its own death cause', (type) => {
    const w = solo([makeMonster(type, 600)]);
    const o = mob(w, type);
    let events: WorldEvent[] = [];
    for (let i = 0; i < 30 && w.runner.alive; i++) {
      park(w.runner, o.wx + o.w / 2 - 22);
      w.step();
      events.push(...w.events.splice(0));
    }
    expect(events.some((e) => e.type === `${type}-hit`)).toBe(true);
    expect(w.runner.alive).toBe(false);
  });
});

describe('hopper', () => {
  it('jumps toward a nearby runner in an arc and stays on its leash', () => {
    const w = solo([makeMonster('hopper', 700, GROUND_Y, 0, 150)]);
    w.runner.god = true;
    const o = mob(w, 'hopper');
    let minY = o.y;
    const events = run(w, 200, () => { park(w.runner, 450); minY = Math.min(minY, o.y); });
    expect(events.some((e) => e.type === 'hop')).toBe(true);
    expect(o.wx).toBeLessThan(700);
    expect(o.wx).toBeGreaterThanOrEqual(550);
    expect(minY).toBeLessThan(GROUND_Y - o.h - 40);
  });
});

describe('swooper', () => {
  it('dives in a curve that misses a ducking runner but hits a standing one', () => {
    const def = makeMonster('swooper', 700);
    const low = GROUND_Y - SWOOP_CLEARANCE - def.h;
    const lowest = { ...def, y: low };
    const feet = { x: 700, feet: GROUND_Y };
    expect(overlaps(duckedBox(feet), hazardBox(lowest))).toBe(false);
    expect(overlaps(standingBox(feet), hazardBox(lowest))).toBe(true);

    const w = solo([def]);
    let lowestSeen = Infinity;
    const o = mob(w, 'swooper');
    const events = run(w, 160, () => {
      park(w.runner, 560);
      w.runner.input = { duck: true };
      lowestSeen = Math.min(lowestSeen, GROUND_Y - (o.y + o.h));
    });
    expect(events.some((e) => e.type === 'swoop')).toBe(true);
    expect(lowestSeen).toBeLessThan(60);
    expect(events.some((e) => e.type === 'swooper-hit')).toBe(false);
    expect(w.runner.alive).toBe(true);
  });
});

describe('spitter', () => {
  it('lobs arcing goo that kills with spitter-hit', () => {
    const w = solo([makeMonster('spitter', 800)]);
    const events = run(w, 240, () => park(w.runner, 500));
    expect(events.some((e) => e.type === 'spit')).toBe(true);
    expect(events.some((e) => e.type === 'spitter-hit')).toBe(true);
  });

  it('goo has a vertical speed and gravity', () => {
    const w = solo([makeMonster('spitter', 800)]);
    w.runner.god = true;
    let goo = w.enemyShots.find((s) => s.style === 'goo');
    for (let i = 0; i < 200 && !goo; i++) { park(w.runner, 500); w.step(); goo = w.enemyShots.find((s) => s.style === 'goo'); }
    expect(goo).toBeDefined();
    expect(goo!.vy).toBeLessThan(0);
    expect(goo!.gravity).toBeGreaterThan(0);
    expect(goo!.cause).toBe('spitter-hit');
  });
});

describe('brute armor', () => {
  it('blocks blaster shots on its front, takes them from behind, and missiles always hurt', () => {
    const w = solo([makeMonster('brute', 800)]);
    const o = mob(w, 'brute');
    o.mob!.dir = -1; // facing left, toward a runner coming from the left
    const front = w.damageObstacle(o, 1, { runner: w.runner, dir: 1, kind: 'pulse' });
    expect(front).toBe('blocked');
    expect(o.hp).toBe(o.maxHp);
    expect(w.damageObstacle(o, 1, { runner: w.runner, dir: -1, kind: 'pulse' })).toBe('hit');
    expect(w.damageObstacle(o, 1, { runner: w.runner, dir: 1, kind: 'missile' })).toBe('hit');
    expect(o.hp).toBe(o.maxHp - 2);
    expect(w.events.some((e) => e.type === 'armor-block')).toBe(true);
  });

  it('blaster projectiles from the front bounce off in the real loop', () => {
    const w = solo([makeMonster('brute', 700, GROUND_Y, 0, 0)]);
    const o = mob(w, 'brute');
    w.runner.god = true;
    run(w, 60, () => { park(w.runner, 450); w.runner.input = { fire: true }; });
    expect(o.hp).toBe(o.maxHp);
    expect(o.broken).toBeFalsy();
  });
});

describe('splitter', () => {
  it('splits into two small blobs when killed, which can be killed too', () => {
    const w = solo([makeMonster('splitter', 900)]);
    const o = mob(w, 'splitter');
    expect(w.damageObstacle(o, 99, { runner: w.runner, dir: 1 })).toBe('killed');
    const bonus = w.runner.bonus;
    expect(bonus).toBeGreaterThan(12);
    w.step();
    const kids = w.obstacles.filter((k) => k.mob?.small && !k.broken);
    expect(kids).toHaveLength(2);
    expect(w.events.some((e) => e.type === 'split')).toBe(true);
    for (const k of kids) expect(w.damageObstacle(k, 1, { runner: w.runner, dir: 1 })).toBe('killed');
    w.step();
    expect(w.obstacles.some((k) => k.mob?.small)).toBe(false);
  });
});

describe('boss', () => {
  const bossLevel = () => solo([makeMonster('boss', 3000, GROUND_Y, 1)], { exit: 3400 });

  it('exposes world.boss, seals the portal and wakes when a runner comes close', () => {
    const w = bossLevel();
    const hp = BOSS_STATS[1].hp;
    expect(w.boss).toMatchObject({ name: BOSS_NAMES[1], hp, maxHp: hp, phase: 1, active: false });
    expect(portalSealed(w)).toBe(true);
    expect(bossHud(w)).toBeNull();
    w.runner.god = true;
    const events = run(w, 5, () => park(w.runner, 2500));
    expect(events.some((e) => e.type === 'boss-intro')).toBe(true);
    expect(w.boss!.active).toBe(true);
    expect(bossHud(w)).toEqual({ name: BOSS_NAMES[1], hp, maxHp: hp, phase: 1 });
  });

  it('a sealed portal cannot be entered', () => {
    const w = bossLevel();
    w.runner.god = true;
    const events = run(w, 5, () => park(w.runner, 3400 - 22));
    expect(events.some((e) => e.type === 'portal')).toBe(false);
  });

  it('attacks with volleys, charges and summons', () => {
    const w = bossLevel();
    w.runner.god = true;
    const o = mob(w, 'boss');
    const events: WorldEvent[] = [];
    // Drop to phase 3 so every attack is in the rotation.
    o.hp = 10;
    o.mob!.phase = 3;
    events.push(...run(w, 900, () => park(w.runner, 2450)));
    const types = new Set(events.map((e) => e.type));
    for (const t of ['boss-intro', 'boss-volley', 'boss-charge', 'boss-summon', 'enemy-fire'] as const) expect(types.has(t)).toBe(true);
    expect(w.obstacles.some((m) => m.mob?.parent === o)).toBe(true);
  });

  it('flashes invulnerable after hits, changes phase, and dies in a big explosion that opens the portal', () => {
    const w = bossLevel();
    w.runner.god = true;
    const o = mob(w, 'boss');
    const events: WorldEvent[] = [];
    let blocked = 0;
    for (let i = 0; i < 4000 && !o.broken; i++) {
      park(w.runner, 1500);
      const r = w.damageObstacle(o, 3, { runner: w.runner, dir: 1, kind: 'missile' });
      if (r === 'blocked') blocked++;
      w.step();
      events.push(...w.events.splice(0));
    }
    expect(o.broken).toBe(true);
    expect(blocked).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'boss-phase')).toHaveLength(2);
    expect(types).toContain('boss-hurt');
    expect(types.indexOf('boss-death')).toBeLessThan(types.indexOf('portal-open'));
    expect(portalSealed(w)).toBe(false);
    expect(w.boss).toMatchObject({ defeated: true, active: false, hp: 0 });
    expect(w.blasts.length).toBeGreaterThan(4);
    expect(w.runner.bonus).toBeGreaterThanOrEqual(800);
  });

  it('shield contact or a stomp damages the boss instead of breaking it', () => {
    const w = bossLevel();
    const o = mob(w, 'boss');
    w.breakObstacle(o, w.runner, true);
    expect(o.broken).toBeFalsy();
    expect(o.hp).toBe(o.maxHp - BOSS_CONTACT_DAMAGE.shield);
  });
});

describe('checkpoint restore', () => {
  it('solo retry at a checkpoint brings killed monsters back and clears enemy shots', () => {
    const w = solo([makeMonster('hopper', 1200), makeMonster('brute', 1600), makeMonster('splitter', 2000)]);
    const [hopper, brute, splitter] = ['hopper', 'brute', 'splitter'].map((t) => mob(w, t as MonsterType));
    for (const o of [hopper!, brute!, splitter!]) w.breakObstacle(o, w.runner);
    w.step();
    expect(w.obstacles.filter((o) => o.mob?.small)).toHaveLength(2);
    w.runner.checkpoint = 400;
    w.enemyShots.push({ x: 600, prevX: 600, y: 300, vx: -5, life: 50, dodged: [] });
    w.kill(w.runner, 'fall');
    w.retry();
    for (const o of [hopper!, brute!, splitter!]) {
      expect(o.broken).toBe(false);
      expect(o.hp).toBe(o.maxHp);
      expect(o.wx).toBe(o.baseX);
    }
    expect(w.obstacles.some((o) => o.mob?.small)).toBe(false);
    expect(w.enemyShots).toHaveLength(0);
    expect(w.runner.alive).toBe(true);
  });

  it('restores classic hazards (drones, slimes) but never walls', () => {
    const w = solo([
      { type: 'wall', wx: 900, w: 38, h: 244, y: GROUND_Y - 244, hp: 3 },
      { type: 'slime', wx: 1300, w: 52, h: 42, y: GROUND_Y - 42, hp: 2 },
    ]);
    const [wall, slime] = w.obstacles;
    w.breakObstacle(wall!, w.runner);
    w.breakObstacle(slime!, w.runner);
    w.runner.checkpoint = 400;
    w.kill(w.runner, 'fall');
    w.retry();
    expect(wall!.broken).toBe(true);
    expect(slime!.broken).toBe(false);
  });

  it('a living boss heals on a solo checkpoint retry; a defeated one stays down', () => {
    const w = solo([makeMonster('boss', 3000)], { exit: 3400 });
    const boss = mob(w, 'boss');
    boss.hp = 5;
    w.runner.checkpoint = 400;
    w.kill(w.runner, 'fall');
    w.retry();
    expect(boss.hp).toBe(boss.maxHp);
    expect(w.boss!.active).toBe(false);
    w.damageObstacle(boss, 999, { runner: w.runner, dir: 1 });
    expect(boss.broken).toBe(true);
    w.kill(w.runner, 'fall');
    w.retry();
    expect(boss.broken).toBe(true);
    expect(portalSealed(w)).toBe(false);
  });

  it('versus respawn restores only killed monsters that are off-screen for the other runner', () => {
    const w = versus([makeMonster('hopper', 1200), makeMonster('hopper', 3400)]);
    const [near, far] = w.obstacles;
    const [rick, morty] = w.runners as [Runner, Runner];
    w.breakObstacle(near!, rick);
    w.breakObstacle(far!, rick);
    park(morty, 1100);
    expect(Math.abs(3400 - morty.x)).toBeGreaterThan(OFFSCREEN);
    rick.checkpoint = 400;
    w.kill(rick, 'fall');
    w.respawn(rick);
    expect(near!.broken).toBe(true);
    expect(far!.broken).toBe(false);
  });

  it('versus respawn after the respawn delay also restores (through World.step)', () => {
    const w = versus([makeMonster('spitter', 3000)]);
    const [rick, morty] = w.runners as [Runner, Runner];
    const spitter = w.obstacles[0]!;
    w.breakObstacle(spitter, morty);
    rick.god = true;
    morty.checkpoint = 400;
    w.kill(morty, 'fall');
    const events = run(w, 70, () => park(rick, 200));
    expect(events.some((e) => e.type === 'respawn' && e.runner === morty)).toBe(true);
    expect(spitter.broken).toBe(false);
  });
});
