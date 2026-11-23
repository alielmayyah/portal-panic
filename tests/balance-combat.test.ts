// Combat balance invariants (bosses and monsters with the free blaster). Numbers come from headless sims of
// the real World loop; see the comments on BOSS_STATS in src/core/enemies.ts.
import { describe, expect, it } from 'vitest';
import {
  BOSS_CONTACT_DAMAGE, BOSS_STATS, MONSTER_TYPES, ORB_HIGH, ORB_LOW, makeMonster, volleyTime,
} from '../src/core/enemies';
import { GROUND_Y, LEVELS } from '../src/core/levels';
import { BOSS_FREEZE_TICKS, grantPower } from '../src/core/powers';
import type { HazardDef, LevelDef, Obstacle, Runner } from '../src/core/types';
import { World, createRunner, duckedBox, hazardBox, overlaps, standingBox } from '../src/core/world';

function arena(hazards: HazardDef[]): World {
  const level: LevelDef = {
    ...LEVELS[0]!, code: 'T-C', name: 'Combat', width: 6000, checkpoint: 400, exit: 3400,
    floors: [{ x: 0, w: 6000, y: GROUND_Y }], platforms: [], pickups: [], hazards,
  };
  (LEVELS as LevelDef[]).push(level);
  const w = new World({ runner: createRunner(), level: LEVELS.length - 1 });
  w.runner.invuln = 0;
  return w;
}
const bossArena = (variant: number) => arena([makeMonster('boss', 3000, GROUND_Y, variant, variant ? 460 : 380)]);
const bossOf = (w: World) => w.obstacles.find((o) => o.type === 'boss')!;
const centre = (o: Obstacle) => o.wx + o.w / 2;
const park = (r: Runner, x: number) => { r.x = x; r.feet = GROUND_Y; r.vx = 0; r.vy = 0; };

/** Seconds for a god-mode runner parked 200 px away, firing the free blaster every tick, to kill the boss. */
function blasterKillSeconds(variant: number): number {
  const w = bossArena(variant);
  const r = w.runner;
  r.god = true;
  const b = bossOf(w);
  let i = 0;
  for (; i < 60 * 200 && !b.broken; i++) {
    park(r, centre(b) - 222);
    r.facing = 1;
    r.input = { fire: true };
    w.step();
    w.events.length = 0;
  }
  return i / 60;
}

/** Reactive dodge (duck the high orb, jump the low one) through one volley in `phase`. True if it survives. */
function dodgeVolley(variant: number, phase: number): boolean {
  const w = bossArena(variant);
  const r = w.runner;
  const m = bossOf(w).mob!;
  m.state = 'volley'; m.t = 0; m.phase = phase; m.shots = 0; m.cool = 0;
  park(r, bossOf(w).wx - 238);
  for (let i = 0; i < 230; i++) {
    let duck = false, jump = false;
    for (const s of w.enemyShots) {
      const tt = (s.x - (r.x + 38)) / Math.abs(s.vx);
      if (tt < -(41 + Math.abs(s.vx)) / Math.abs(s.vx)) continue; // already past the runner
      if (s.y > GROUND_Y - 35 && tt <= 7) jump = true;
      if (s.y <= GROUND_Y - 35 && tt <= 5) duck = true;
    }
    r.input = jump && r.grounded ? { jump: true } : !r.grounded && r.vy < 0 ? { jump: true } : duck && r.grounded ? { duck: true } : {};
    w.step();
    w.events.length = 0;
    if (!r.alive) return false;
  }
  return true;
}

/** Number of dash-relative jump timings (run toward the boss + full jump) that clear the charge. */
function chargeWindow(variant: number, gap: number): number {
  let ok = 0;
  for (let k = -25; k <= 30; k++) {
    const w = bossArena(variant);
    const r = w.runner;
    const b = bossOf(w);
    const m = b.mob!;
    m.state = 'charge'; m.t = 0;
    park(r, b.wx - gap - 38);
    const jumpAt = BOSS_STATS[variant ? 1 : 0].chargeWindup + k;
    let dashed = false, alive = true;
    for (let i = 0; i < 200; i++) {
      r.input = i >= jumpAt ? { jump: i - jumpAt < 20, right: true } : {};
      w.step();
      w.events.length = 0;
      if (!r.alive) { alive = false; break; }
      if ((m.state as string) === 'dash') dashed = true;
      else if (dashed) break;
    }
    if (alive && dashed) ok++;
  }
  return ok;
}

describe('boss time to kill with the free blaster', () => {
  // A competent player keeps ~75% uptime (measured with a dodging bot: mid ~45 s, final ~66-99 s).
  it('mid boss (level 4): 30-40 s of pure damage output (target 35-60 s of play)', () => {
    const s = blasterKillSeconds(0);
    expect(s).toBeGreaterThanOrEqual(30);
    expect(s).toBeLessThanOrEqual(40);
  });
  it('final boss (level 8): 50-65 s of pure damage output (target 60-100 s of play)', () => {
    const s = blasterKillSeconds(1);
    expect(s).toBeGreaterThanOrEqual(50);
    expect(s).toBeLessThanOrEqual(65);
  });
});

describe('boss attacks are telegraphed and avoidable', () => {
  it('every attack winds up for at least 30 ticks', () => {
    for (const s of BOSS_STATS) {
      expect(s.volleyWindup).toBeGreaterThanOrEqual(30);
      expect(s.chargeWindup).toBeGreaterThanOrEqual(30);
    }
  });

  it('a high orb after a low one comes late enough to land from the jump first (>= 40 ticks)', () => {
    for (const s of BOSS_STATS) {
      for (let k = 2; k < 8; k += 2) expect(volleyTime(s, k) - volleyTime(s, k - 1)).toBeGreaterThanOrEqual(40);
    }
  });

  it('high orbs clear a ducking runner, low orbs clear a jumping one', () => {
    const feet = { x: 500, feet: GROUND_Y };
    const orb = (h: number) => ({ x: 500, y: GROUND_Y - h - 5, w: 60, h: 10 });
    expect(overlaps(duckedBox(feet), orb(ORB_HIGH))).toBe(false);
    expect(overlaps(standingBox(feet), orb(ORB_HIGH))).toBe(true);
    expect(overlaps(standingBox({ x: 500, feet: GROUND_Y - 30 }), orb(ORB_LOW))).toBe(false);
  });

  it.each([[0, 1], [0, 2], [0, 3], [1, 1], [1, 2], [1, 3]])('boss %i phase %i volley can be dodged by reacting to each orb', (v, phase) => {
    expect(dodgeVolley(v, phase)).toBe(true);
  });

  it.each([0, 1])('boss %i charge can be jumped over with a generous timing window', (v) => {
    for (const gap of [120, 220, 320]) expect(chargeWindow(v, gap)).toBeGreaterThanOrEqual(15);
  });
});

describe('powers do not trivialize a boss', () => {
  it('a time freeze lets the blaster land hits but releases the boss after BOSS_FREEZE_TICKS', () => {
    const w = bossArena(0);
    const r = w.runner;
    r.god = true;
    const b = bossOf(w);
    b.mob!.state = 'idle';
    b.mob!.cool = 9999;
    grantPower(w, r, 'freeze');
    const hp = b.hp;
    let moved = -1;
    const x0 = b.mob!.t;
    for (let i = 0; i < 300; i++) {
      park(r, centre(b) - 222); r.facing = 1; r.input = { fire: true };
      w.step();
      w.events.length = 0;
      if (moved < 0 && b.mob!.t !== x0) moved = i;
    }
    expect(hp - b.hp).toBeGreaterThan(5); // not one hit for the whole freeze
    expect(hp - b.hp).toBeLessThanOrEqual(21); // at most the blaster's normal rate
    expect(moved).toBeGreaterThanOrEqual(BOSS_FREEZE_TICKS - 2);
    expect(moved).toBeLessThanOrEqual(BOSS_FREEZE_TICKS + 2);
  });

  it('shield contact and a giant stomp are worth a slice of the boss, never most of it', () => {
    for (const s of BOSS_STATS) {
      expect(BOSS_CONTACT_DAMAGE.stomp / s.hp).toBeLessThanOrEqual(.15);
      expect(BOSS_CONTACT_DAMAGE.shield / s.hp).toBeLessThanOrEqual(.1);
    }
    const w = bossArena(1);
    const b = bossOf(w);
    w.breakObstacle(b, w.runner, true);
    w.breakObstacle(b, w.runner, true); // repeated contact within the cooldown does nothing more
    expect(b.maxHp - b.hp).toBe(BOSS_CONTACT_DAMAGE.shield);
  });

  it('records who killed the boss and when the portal opened', () => {
    const w = bossArena(0);
    const b = bossOf(w);
    w.step();
    w.damageObstacle(b, 9999, { runner: w.runner, dir: 1 });
    w.step();
    expect(w.boss).toMatchObject({ defeated: true, killer: w.runner });
    expect(w.boss!.openedAt).toBeGreaterThan(0);
  });
});

describe('monsters', () => {
  it('every monster dies to a handful of blaster shots', () => {
    for (const type of MONSTER_TYPES) if (type !== 'boss') expect(makeMonster(type, 500).hp).toBeLessThanOrEqual(5);
  });

  it('contact boxes sit inside the drawn body (no wider than the box, flush with the floor)', () => {
    for (const type of MONSTER_TYPES) {
      const def = makeMonster(type, 500);
      const box = hazardBox(def);
      expect(box.x).toBeGreaterThan(def.wx);
      expect(box.x + box.w).toBeLessThan(def.wx + def.w);
      expect(box.y).toBeGreaterThan(def.y);
    }
    // Boss boxes stop below the crown spikes / horn tips (art reaches ~108 / ~120 above the floor).
    expect(hazardBox(makeMonster('boss', 0, GROUND_Y, 0)).y).toBeGreaterThanOrEqual(GROUND_Y - 86);
    expect(hazardBox(makeMonster('boss', 0, GROUND_Y, 1)).y).toBeGreaterThanOrEqual(GROUND_Y - 104);
  });
});
