import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOLO_KEYS, VERSUS_KEYS, CONTROL_SCHEMES, CONTROL_LABELS } from '../src/core/input';
import { GROUND_Y, makeHazard } from '../src/core/levels';
import {
  DEFAULT_SHOP, SHOP_KEYS, addCoins, buyUpgrade, buyWeapon, equipWeapon, loadoutFor, normalizeShop, upgradePrice,
} from '../src/core/shop';
import type { HazardDef, Obstacle, RunnerInput, WorldEvent } from '../src/core/types';
import {
  CHARGE_TICKS, COIN_VALUES, WEAPONS, WEAPON_IDS, chargeLevel, coinDrops, collectRunCoins, currentWeapon, equipRun,
  runCoins, weaponsView, type Loadout, type WeaponId,
} from '../src/core/weapons';
import { World, createRunner } from '../src/core/world';

function soloWorld(loadout?: Partial<Loadout>): World {
  const world = new World({ runner: createRunner(), level: 0 });
  world.runner.invuln = 0;
  if (loadout) equipRun(world, [{ weapons: ['blaster'], equipped: 'blaster', maxMissiles: 5, startShield: false, ...loadout }]);
  clearCourse(world);
  return world;
}

/** Empty course so only what a test adds matters. */
function clearCourse(world: World): void {
  world.obstacles = [];
  world.walls = [];
  world.orbs = [];
  world.platforms = [];
  world.surfaces = [...world.dimension.floors];
}

const toObstacle = (def: HazardDef): Obstacle => ({ ...def, x: def.wx, baseX: def.wx, baseY: def.y, maxHp: def.hp, charge: 0, readyAt: 1e9, flash: 0 });

function add(world: World, def: HazardDef): Obstacle {
  const o = toObstacle(def);
  world.obstacles.push(o);
  if (o.type === 'wall') { world.walls.push(o); world.surfaces.push(o); }
  return o;
}

/** Steps with a fixed input, collecting events. */
function run(world: World, input: RunnerInput, ticks: number): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    world.runner.input = { ...input };
    world.step();
    seen.push(...world.events.splice(0));
  }
  return seen;
}

const armed = (weapon: WeaponId, extra: Partial<Loadout> = {}) => soloWorld({ weapons: ['blaster', weapon], equipped: weapon, ...extra });

describe('weapon table', () => {
  it('has at least five weapons beyond the blaster, each with price, cooldown, damage and range', () => {
    const extra = WEAPON_IDS.filter((id) => id !== 'blaster');
    expect(extra.length).toBeGreaterThanOrEqual(5);
    expect(new Set(extra.map((id) => WEAPONS[id].kind)).size).toBe(extra.length);
    for (const id of extra) {
      const w = WEAPONS[id];
      expect(w.price).toBeGreaterThan(0);
      expect(w.cooldown).toBeGreaterThan(0);
      expect(w.damage).toBeGreaterThan(0);
      expect(w.range).toBeGreaterThan(0);
    }
    expect(WEAPONS.blaster.price).toBe(0);
  });
});

describe('firing', () => {
  it('the default blaster still fires through the World pulse', () => {
    const world = soloWorld();
    run(world, { fire: true }, 1);
    expect(world.projectiles).toHaveLength(1);
    expect(currentWeapon(world.runner).id).toBe('blaster');
  });

  it('Scatter Fan fires three pellets that spread out', () => {
    const world = armed('scatter');
    run(world, { fire: true }, 1);
    const shots = weaponsView(world).shots;
    expect(shots).toHaveLength(3);
    expect(new Set(shots.map((s) => Math.sign(Math.round(s.vy)))).size).toBe(3);
    expect(world.projectiles).toHaveLength(0);
  });

  it('Prism Lance hits instantly and pierces monsters, but stops at a wall', () => {
    const world = armed('lance');
    const a = add(world, makeHazard('slime', 220));
    const b = add(world, makeHazard('slime', 330));
    const wall = add(world, makeHazard('wall', 420, GROUND_Y, 9));
    const c = add(world, makeHazard('slime', 480));
    run(world, { fire: true }, 1);
    expect(a.broken && b.broken).toBe(true);
    expect(c.broken).toBeFalsy();
    expect(wall.hp).toBe(9 - WEAPONS.lance.damage);
    expect(weaponsView(world).beams[0]!.x2).toBe(420);
  });

  it('Ricochet Orb bounces off the ground', () => {
    const world = armed('ricochet');
    run(world, { fire: true }, 1);
    const shot = weaponsView(world).shots[0]!;
    let bounced = false;
    for (let i = 0; i < 40 && !bounced; i++) {
      const before = shot.vy;
      run(world, {}, 1);
      if (before > 0 && shot.vy < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(shot.life).toBeGreaterThan(0);
  });

  it('Hornet Pods steer into a monster above the firing line', () => {
    const world = armed('seeker');
    const drone = add(world, { ...makeHazard('drone', 330), patrol: 0, lift: 0, volley: 0, hp: 2 });
    run(world, { fire: true }, 1);
    run(world, {}, 60);
    expect(drone.broken).toBe(true);
  });

  it('a straight blaster shot misses that same drone', () => {
    const world = soloWorld();
    const drone = add(world, { ...makeHazard('drone', 330), patrol: 0, lift: 0, volley: 0, hp: 2 });
    run(world, { fire: true }, 1);
    run(world, {}, 30);
    expect(drone.hp).toBe(2);
  });

  it('Ember Hose fires continuously while held, only at short range', () => {
    const world = armed('ember');
    const near = add(world, makeHazard('slime', 190));
    const far = add(world, makeHazard('slime', 330));
    near.hp = far.hp = 50;
    run(world, { fire: true }, 30);
    expect(weaponsView(world).shots.length).toBeGreaterThan(4);
    run(world, {}, 30);
    expect(near.hp).toBeLessThan(50);
    expect(far.hp).toBe(50);
    expect(weaponsView(world).shots).toHaveLength(0);
  });

  it('Nova Cannon charges while held and fires on release; a full charge pierces', () => {
    const world = armed('nova');
    const a = add(world, makeHazard('slime', 300));
    const b = add(world, makeHazard('slime', 400));
    a.hp = b.hp = 5;
    run(world, { fire: true }, CHARGE_TICKS + 5);
    expect(chargeLevel(world.runner)).toBe(1);
    expect(weaponsView(world).shots).toHaveLength(0);
    run(world, {}, 1);
    const shot = weaponsView(world).shots[0]!;
    expect(shot.damage).toBe(WEAPONS.nova.damage);
    expect(shot.pierce).toBe(true);
    run(world, {}, 30);
    expect(a.broken && b.broken).toBe(true);
  });

  it('a short Nova tap fires a weak shot that does not pierce', () => {
    const world = armed('nova');
    run(world, { fire: true }, 6);
    run(world, {}, 1);
    const shot = weaponsView(world).shots[0]!;
    expect(shot.damage).toBeLessThan(3);
    expect(shot.pierce).toBe(false);
  });
});

describe('weapon swap', () => {
  it('a swap press cycles through owned weapons; holding it does not repeat', () => {
    const world = soloWorld({ weapons: ['blaster', 'scatter', 'nova'], equipped: 'scatter' });
    const r = world.runner;
    expect(currentWeapon(r).id).toBe('scatter');
    const events = run(world, { swap: true }, 5);
    expect(currentWeapon(r).id).toBe('nova');
    expect(events.filter((e) => e.type === 'weapon-swap')).toHaveLength(1);
    run(world, {}, 1);
    run(world, { swap: true }, 1);
    expect(currentWeapon(r).id).toBe('blaster');
  });

  it('with only the blaster, swap does nothing', () => {
    const world = soloWorld();
    expect(run(world, { swap: true }, 1).some((e) => e.type === 'weapon-swap')).toBe(false);
  });

  it('is bound to Q (solo and Rick) and Right Ctrl (Morty), and listed in the control schemes', () => {
    expect(SOLO_KEYS.KeyQ).toEqual([0, 'swap']);
    expect(VERSUS_KEYS.KeyQ).toEqual([0, 'swap']);
    expect(VERSUS_KEYS.ControlRight).toEqual([1, 'swap']);
    for (const mode of ['solo', 'versus'] as const) for (const scheme of CONTROL_SCHEMES[mode]) expect(scheme.keys).toHaveLength(CONTROL_LABELS.length);
  });

  it('versus runners keep separate loadouts', () => {
    const world = new World({ runner: createRunner(), rival: createRunner({ name: 'Morty', character: 'morty' }), level: 0 });
    equipRun(world, [
      { weapons: ['blaster', 'lance'], equipped: 'lance', maxMissiles: 5, startShield: false },
      { weapons: ['blaster', 'ember'], equipped: 'ember', maxMissiles: 7, startShield: true },
    ]);
    const [rick, morty] = world.runners;
    expect(currentWeapon(rick!).id).toBe('lance');
    expect(currentWeapon(morty!).id).toBe('ember');
    expect(morty!.maxMissiles).toBe(7);
    expect(morty!.shield).toBe(true);
    expect(rick!.shield).toBe(false);
  });
});

describe('upgrades in a run', () => {
  it('missile rack raises the cell pickup cap', () => {
    const world = soloWorld({ maxMissiles: 8 });
    const r = world.runner;
    r.missiles = 7;
    for (let i = 0; i < 2; i++) {
      world.orbs.push({ kind: 'cell', wx: r.x + 22, y: r.feet - 30, r: 12, phase: 0 });
      run(world, {}, 1);
    }
    expect(r.missiles).toBe(8);
  });

  it('without the upgrade the cap stays at 5', () => {
    const world = soloWorld({});
    const r = world.runner;
    r.missiles = 5;
    world.orbs.push({ kind: 'cell', wx: r.x + 22, y: r.feet - 30, r: 12, phase: 0 });
    run(world, {}, 1);
    expect(r.missiles).toBe(5);
  });

  it('pocket shield is granted at the start of every level', () => {
    const world = soloWorld({ startShield: true });
    expect(world.runner.shield).toBe(true);
    world.runner.shield = false;
    world.nextLevel();
    expect(world.runner.shield).toBe(true);
  });
});

describe('coins', () => {
  it('cells, kills and coin drops add run coins; drops are collected by walking into them', () => {
    const world = armed('lance');
    const r = world.runner;
    world.orbs.push({ kind: 'cell', wx: r.x + 22, y: r.feet - 30, r: 12, phase: 0 });
    run(world, {}, 1);
    expect(runCoins(r)).toBe(COIN_VALUES.cell);
    add(world, makeHazard('slime', 300));
    run(world, { fire: true }, 1);
    expect(runCoins(r)).toBe(COIN_VALUES.cell + COIN_VALUES.kill);
    const drop = coinDrops(world)[0]!;
    expect(drop).toBeDefined();
    run(world, {}, 40);
    expect(drop.grounded).toBe(true);
    r.x = drop.x - 22;
    const events = run(world, {}, 2);
    expect(events.some((e) => e.type === 'coin')).toBe(true);
    expect(runCoins(r)).toBe(COIN_VALUES.cell + COIN_VALUES.kill + COIN_VALUES.drop);
    expect(coinDrops(world)).toHaveLength(0);
  });

  it('collectRunCoins banks and resets; a solo level clear and a finished run add the clear bonus once', () => {
    const world = soloWorld({});
    world.nextLevel();
    expect(runCoins(world.runner)).toBe(COIN_VALUES.clearBase);
    expect(collectRunCoins(world)).toBe(COIN_VALUES.clearBase);
    expect(runCoins(world.runner)).toBe(0);
    world.forcePortal();
    const bonus = COIN_VALUES.clearBase + COIN_VALUES.clearPerLevel;
    expect(collectRunCoins(world, true)).toBe(bonus);
    expect(collectRunCoins(world, true)).toBe(0);
  });

  it('earns nothing with cheats or in an unarmed (menu preview) world', () => {
    const cheated = soloWorld({});
    cheated.nextLevel();
    cheated.cheatsUsed = true;
    expect(collectRunCoins(cheated)).toBe(0);
    const preview = soloWorld();
    preview.orbs.push({ kind: 'cell', wx: preview.runner.x + 22, y: preview.runner.feet - 30, r: 12, phase: 0 });
    run(preview, {}, 1);
    expect(collectRunCoins(preview)).toBe(0);
  });

  it('loading a level clears weapon shots and coin drops', () => {
    const world = armed('scatter');
    run(world, { fire: true }, 1);
    coinDrops(world).push({ x: 300, y: 300, vx: 0, vy: 0, value: 3, life: 100, grounded: true, spin: 0 });
    world.loadLevel(0);
    expect(weaponsView(world).shots).toHaveLength(0);
    expect(weaponsView(world).drops).toHaveLength(0);
  });

  it('respawning drops a held charge and the runner\'s shots', () => {
    const world = armed('nova');
    run(world, { fire: true }, 20);
    expect(chargeLevel(world.runner)).toBeGreaterThan(0);
    world.respawn(world.runner);
    expect(chargeLevel(world.runner)).toBe(0);
  });
});

describe('shop rules', () => {
  const rich = { ...DEFAULT_SHOP, coins: 1000 };

  it('buys a weapon once, only with enough coins, and can equip it for the buyer', () => {
    expect(buyWeapon(DEFAULT_SHOP, 'scatter')).toBeNull();
    const next = buyWeapon(rich, 'scatter', 'morty')!;
    expect(next.coins).toBe(1000 - WEAPONS.scatter.price);
    expect(next.ownedWeapons).toEqual(['blaster', 'scatter']);
    expect(next.equipped).toEqual({ rick: 'blaster', morty: 'scatter' });
    expect(buyWeapon(next, 'scatter')).toBeNull();
  });

  it('equips only owned weapons, per pilot', () => {
    expect(equipWeapon(rich, 'rick', 'nova')).toBeNull();
    const owned = buyWeapon(rich, 'nova')!;
    const next = equipWeapon(owned, 'rick', 'nova')!;
    expect(next.equipped).toEqual({ rick: 'nova', morty: 'blaster' });
  });

  it('missile rack goes up to 8 missiles, then is maxed; pocket shield is one purchase', () => {
    let s = rich;
    for (let i = 0; i < 3; i++) s = buyUpgrade(s, 'missile-cap')!;
    expect(upgradePrice(s, 'missile-cap')).toBeNull();
    expect(buyUpgrade(s, 'missile-cap')).toBeNull();
    expect(loadoutFor(s, 'rick').maxMissiles).toBe(8);
    s = buyUpgrade(s, 'start-shield')!;
    expect(s.upgrades.startShield).toBe(true);
    expect(buyUpgrade(s, 'start-shield')).toBeNull();
    expect(s.coins).toBe(1000 - 150 - 220 - 300 - 260);
  });

  it('loadouts carry every owned weapon and start on the equipped one', () => {
    const s = equipWeapon(buyWeapon(buyWeapon(rich, 'lance')!, 'ember')!, 'morty', 'ember')!;
    expect(loadoutFor(s, 'morty')).toEqual({ weapons: ['blaster', 'ember', 'lance'], equipped: 'ember', maxMissiles: 5, startShield: false });
    expect(loadoutFor(s, 'rick').equipped).toBe('blaster');
  });

  it('normalizes junk from storage', () => {
    const s = normalizeShop({ coins: -5, ownedWeapons: ['nova', 'bogus', 7], equipped: { rick: 'lance', morty: 'nova' }, upgrades: { missileCap: 99, startShield: 'yes' } });
    expect(s).toEqual({ coins: 0, ownedWeapons: ['blaster', 'nova'], equipped: { rick: 'blaster', morty: 'nova' }, upgrades: { missileCap: 3, startShield: false } });
    expect(addCoins(DEFAULT_SHOP, 12.7).coins).toBe(12);
    expect(addCoins(DEFAULT_SHOP, -3)).toBe(DEFAULT_SHOP);
  });
});

describe('store actions and persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function fakeStorage(seed: Record<string, unknown> = {}) {
    const data = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, String(v)); },
      removeItem: (k: string) => { data.delete(k); },
    };
    vi.stubGlobal('localStorage', storage);
    return data;
  }

  it('loads, buys, equips, upgrades and banks coins under portal: keys', async () => {
    const data = fakeStorage({ [SHOP_KEYS.coins]: 400, [SHOP_KEYS.weapons]: ['scatter'] });
    const { actions, store } = await import('../src/core/store');
    expect(store.getState().coins).toBe(400);
    expect(store.getState().ownedWeapons).toEqual(['blaster', 'scatter']);
    expect(actions.buyWeapon('scatter')).toBe(false); // already owned
    expect(actions.buyWeapon('ricochet', 'rick')).toBe(true);
    expect(store.getState().equipped.rick).toBe('ricochet');
    expect(actions.equip('morty', 'scatter')).toBe(true);
    expect(actions.equip('morty', 'nova')).toBe(false);
    expect(actions.buyUpgrade('missile-cap')).toBe(true);
    actions.addCoins(25);
    expect(store.getState().coins).toBe(400 - 180 - 150 + 25);
    expect(JSON.parse(data.get(SHOP_KEYS.coins)!)).toBe(95);
    expect(JSON.parse(data.get(SHOP_KEYS.weapons)!)).toEqual(['blaster', 'scatter', 'ricochet']);
    expect(JSON.parse(data.get(SHOP_KEYS.equipped)!)).toEqual({ rick: 'ricochet', morty: 'scatter' });
    expect(JSON.parse(data.get(SHOP_KEYS.upgrades)!)).toEqual({ missileCap: 1, startShield: false });
    actions.openShop();
    expect(store.getState().screen).toBe('shop');
    actions.closeShop();
    expect(store.getState().screen).toBe('menu');
  });
});
