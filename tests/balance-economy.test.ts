// Economy balance invariants: coins a full clear earns against shop prices, and weapon power against price.
// Numbers come from headless simulations of the real World, so level, monster and weapon edits are all covered.
import { describe, expect, it } from 'vitest';
import { LEVELS, makeHazard } from '../src/core/levels';
import { UPGRADES } from '../src/core/shop';
import type { HazardDef, Obstacle, RunnerInput } from '../src/core/types';
import {
  COIN_VALUES, DEFAULT_LOADOUT, WEAPONS, WEAPON_IDS, chargeLevel, coinDrops, equipRun, runCoins, type WeaponId,
} from '../src/core/weapons';
import { World, createRunner } from '../src/core/world';

/** Coins for breaking everything on a level, taking every cell and drop, and finishing it (boss minions not counted). */
function fullClearCoins(level: number): number {
  const world = new World({ runner: createRunner(), level });
  equipRun(world, [DEFAULT_LOADOUT]);
  const r = world.runner;
  r.god = true;
  let coins = world.orbs.filter((o) => o.kind === 'cell').length * COIN_VALUES.cell;
  for (let pass = 0; pass < 6; pass++) {
    for (const o of world.obstacles) {
      if (o.broken) continue;
      if (o.mob?.kind === 'boss') { o.mob.invuln = 0; o.mob.state = 'idle'; o.hp = 1; }
      world.damageObstacle(o, 999, { runner: r, dir: 1, kind: 'missile' });
    }
    for (const drop of coinDrops(world)) coins += drop.value;
    coinDrops(world).length = 0;
    world.step(); // splitter children join the course
  }
  return coins + runCoins(r) + COIN_VALUES.clearBase + COIN_VALUES.clearPerLevel * level;
}

const fireFor = (id: WeaponId) => (world: World): boolean => WEAPONS[id].kind !== 'charge' || chargeLevel(world.runner) < 1;

/**
 * Steady-state damage per second into a boss (level 4 or 8) by a runner that keeps the weapon's preferred distance
 * and faces it. The boss gets a huge health pool and is held in `phase`, so hit flashes, movement, dashes and
 * minions all count, but the fight never ends.
 */
function bossDps(id: WeaponId, level: number, phase: number, seconds = 30): number {
  const world = new World({ runner: createRunner(), level });
  equipRun(world, [{ ...DEFAULT_LOADOUT, weapons: ['blaster', id], equipped: id }]);
  const r = world.runner;
  r.god = true;
  r.invuln = 1e9;
  const boss = world.obstacles.find((o) => o.type === 'boss')!;
  world.obstacles = [boss];
  world.walls = [];
  world.orbs = [];
  world.platforms = [];
  world.surfaces = [{ x: -1000, w: 20000, y: 340 }];
  r.x = boss.wx - 500;
  boss.hp = boss.maxHp = 100_000;
  const fire = fireFor(id);
  const want = id === 'ember' ? 50 : Math.min(WEAPONS[id].range * .55, 200);
  let first = -1;
  for (let t = 0; t < 60 * 120; t++) {
    if (boss.mob && boss.mob.phase < phase) boss.mob.phase = phase;
    if (first < 0 && boss.hp < boss.maxHp) first = t;
    if (first >= 0 && t - first >= seconds * 60) break;
    const bc = boss.wx + boss.w / 2;
    const rc = r.x + 22;
    let input: RunnerInput;
    if ((bc - rc) * r.facing < 0) input = { left: bc < rc, right: bc > rc };
    else {
      const gap = r.facing > 0 ? boss.wx - (r.x + 45) : r.x - (boss.wx + boss.w);
      input = { fire: fire(world), right: r.facing > 0 && gap > want + 15, left: r.facing < 0 && gap > want + 15 };
    }
    r.input = input;
    world.step();
    world.events.length = 0;
  }
  return (100_000 - boss.hp) / seconds;
}

const meanBossDps = (id: WeaponId): number =>
  ([[3, 1], [3, 3], [7, 1], [7, 3]] as const).reduce((sum, [level, phase]) => sum + bossDps(id, level, phase), 0) / 4;

function armedRange(id: WeaponId): World {
  const world = new World({ runner: createRunner(), level: 0 });
  equipRun(world, [{ ...DEFAULT_LOADOUT, weapons: ['blaster', id], equipped: id }]);
  world.obstacles = [];
  world.walls = [];
  world.orbs = [];
  world.platforms = [];
  world.surfaces = [{ x: -1000, w: 20000, y: 340 }];
  world.runner.god = true;
  world.runner.invuln = 1e9;
  world.runner.x = 100;
  return world;
}

const place = (world: World, def: HazardDef): Obstacle => {
  const o: Obstacle = { ...def, x: def.wx, baseX: def.wx, baseY: def.y, maxHp: def.hp, charge: 0, readyAt: 1e9, flash: 0 };
  world.obstacles.push(o);
  return o;
};

/** Damage per second into one tough target `dist` ahead of the muzzle (an airborne drone when `air`). */
function rangeDps(id: WeaponId, dist: number, air = false): number {
  const world = armedRange(id);
  const fire = fireFor(id);
  const x = 145 + dist;
  const target = place(world, air ? { ...makeHazard('drone', x), patrol: 0, lift: 0, volley: 0, hp: 1e6 } : { ...makeHazard('slime', x), hp: 1e6 });
  for (let t = 0; t < 600; t++) { world.runner.input = { fire: fire(world) }; world.step(); world.events.length = 0; }
  return (1e6 - target.hp) / 10;
}

/** Seconds to clear six 4-hp ground monsters in a line, walking up to stay in range. */
function lineClear(id: WeaponId): number {
  const world = armedRange(id);
  const fire = fireFor(id);
  const list = Array.from({ length: 6 }, (_, i) => place(world, { ...makeHazard('slime', 255 + i * 60), hp: 4 }));
  const want = Math.min(WEAPONS[id].range * .6, 200);
  for (let t = 0; t < 3600; t++) {
    if (list.every((o) => o.broken)) return t / 60;
    const near = Math.min(...list.filter((o) => !o.broken).map((o) => o.wx)) - (world.runner.x + 45);
    world.runner.input = { fire: fire(world), right: near > want };
    world.step();
    world.events.length = 0;
  }
  return 60;
}

const shopWeapons = WEAPON_IDS.filter((id) => id !== 'blaster');
const byPrice = [...WEAPON_IDS].sort((a, b) => WEAPONS[a].price - WEAPONS[b].price);

describe('coins against prices', () => {
  const perLevel = LEVELS.map((_, level) => fullClearCoins(level));
  const sum = (n: number) => perLevel.slice(0, n).reduce((a, b) => a + b, 0);
  const prices = shopWeapons.map((id) => WEAPONS[id].price).sort((a, b) => a - b);
  const cheapestUpgrade = Math.min(...Object.values(UPGRADES).map((u) => u.prices[0]!));

  it('a first clear of levels 1-3 buys one cheap weapon (Scatter or Ricochet), not two', () => {
    expect(sum(3)).toBeGreaterThanOrEqual(Math.max(WEAPONS.scatter.price, WEAPONS.ricochet.price));
    expect(sum(3)).toBeLessThan(WEAPONS.scatter.price + WEAPONS.ricochet.price);
  });

  it('a full 1-8 clear buys three to four weapons plus an upgrade, not the whole shop', () => {
    const three = prices.slice(0, 3).reduce((a, b) => a + b, 0) + cheapestUpgrade;
    const four = prices.slice(0, 4).reduce((a, b) => a + b, 0) + cheapestUpgrade;
    expect(sum(8)).toBeGreaterThanOrEqual(three);
    expect(sum(8)).toBeGreaterThan(four * .9);
    expect(sum(8)).toBeLessThan(prices.reduce((a, b) => a + b, 0));
  });

  it('no purchase needs more than three clears of the best-paying level', () => {
    const all = [...prices, ...Object.values(UPGRADES).flatMap((u) => u.prices)];
    expect(Math.max(...all)).toBeLessThanOrEqual(3 * Math.max(...perLevel));
  });

  it('later levels pay more than the first', () => {
    for (let level = 1; level < perLevel.length; level++) expect(perLevel[level]).toBeGreaterThan(perLevel[0]!);
  });
});

describe('weapon power against price', () => {
  const dps = Object.fromEntries(WEAPON_IDS.map((id) => [id, meanBossDps(id)])) as Record<WeaponId, number>;

  it('multi-hit weapons keep their damage through a boss hit flash', () => {
    // Three Scatter pellets land in the same tick; the flash would otherwise eat two of them.
    const world = new World({ runner: createRunner(), level: 3 });
    equipRun(world, [{ ...DEFAULT_LOADOUT, weapons: ['blaster', 'scatter'], equipped: 'scatter' }]);
    const boss = world.obstacles.find((o) => o.type === 'boss')!;
    world.obstacles = [boss];
    world.runner.god = true;
    world.runner.x = boss.wx - 140;
    boss.hp = boss.maxHp = 1000;
    world.runner.input = { fire: true };
    world.step();
    world.runner.input = {};
    for (let t = 0; t < 30; t++) world.step();
    expect(boss.maxHp - boss.hp).toBe(3 * WEAPONS.scatter.damage);
  });

  it('every bought weapon beats the free blaster on bosses, and none more than doubles it', () => {
    for (const id of shopWeapons) {
      expect(dps[id], id).toBeGreaterThan(dps.blaster);
      expect(dps[id], id).toBeLessThan(dps.blaster * 2);
    }
  });

  it('no weapon has over 1.6x the boss DPS of the next cheaper one', () => {
    for (let i = 1; i < byPrice.length; i++) {
      const id = byPrice[i]!;
      expect(dps[id] / dps[byPrice[i - 1]!], id).toBeLessThanOrEqual(1.6);
    }
  });

  it('the priciest weapon is the top boss weapon (within a few percent)', () => {
    const top = byPrice[byPrice.length - 1]!;
    expect(dps[top]).toBeGreaterThanOrEqual(Math.max(...WEAPON_IDS.map((id) => dps[id])) * .95);
  });

  it('each weapon has its own niche', () => {
    // Air: Hornet Pods hit a hovering drone best without jumping.
    const air = Object.fromEntries(WEAPON_IDS.map((id) => [id, rangeDps(id, 220, true)])) as Record<WeaponId, number>;
    expect(Math.max(...WEAPON_IDS.map((id) => air[id]))).toBe(air.seeker);
    expect(air.scatter).toBeGreaterThan(0);
    // Lines of monsters: Prism Lance clears them fastest.
    const lines = WEAPON_IDS.map((id) => lineClear(id));
    expect(Math.min(...lines)).toBe(lines[WEAPON_IDS.indexOf('lance')]);
    // Long range: Ricochet Orb out-damages the blaster (which cannot reach) and Lance at 420.
    expect(rangeDps('ricochet', 420)).toBeGreaterThan(Math.max(rangeDps('blaster', 420), rangeDps('lance', 420)));
    // Point blank: Ember Hose has the best sustained DPS of anything cheaper than the Nova Cannon.
    const close = WEAPON_IDS.filter((id) => WEAPONS[id].price < WEAPONS.nova.price).map((id) => rangeDps(id, 60));
    expect(Math.max(...close)).toBe(rangeDps('ember', 60));
    // Cheapest: Scatter Fan is the cheapest real boss upgrade over the blaster.
    expect(dps.scatter / dps.blaster).toBeGreaterThan(1.25);
  });
});

describe('versus coin drops', () => {
  it('a drop both runners touch on the same tick alternates owner by tick parity', () => {
    const owners = [0, 1].map((parity) => {
      const world = new World({ runner: createRunner(), rival: createRunner({ name: 'Morty', character: 'morty' }), level: 0 });
      equipRun(world, [DEFAULT_LOADOUT, DEFAULT_LOADOUT]);
      world.obstacles = [];
      world.orbs = [];
      const [rick, morty] = world.runners;
      morty!.x = rick!.x;
      world.tick = 10 + parity - 1; // step() increments the tick before the drops are checked
      coinDrops(world).push({ x: rick!.x + 22, y: rick!.feet - 30, vx: 0, vy: 0, value: 3, life: 100, grounded: true, spin: 0 });
      world.step();
      return runCoins(rick!) ? 'rick' : runCoins(morty!) ? 'morty' : 'none';
    });
    expect([...owners].sort()).toEqual(['morty', 'rick']);
  });
});
