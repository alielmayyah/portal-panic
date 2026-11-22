// Wave 2 monsters and bosses (src/core/enemies.ts): hopper, swooper, spitter, brute, splitter, boss,
// their shots (goo, boss orbs), the boss HP bar and the portal seal. World coordinates.
import type { EnemyShotView, ObstacleView } from './view';
import { type G, INK, TAU, arc, dashed, glowOval, line, oval, rect, shape, strokeRect, withAlpha } from './prims';

/** Read-only view of core MobState (structural). */
export interface MobView {
  readonly kind: string;
  readonly state: string;
  readonly t: number;
  readonly dir: number;
  readonly small: boolean;
  readonly air: boolean;
  readonly land: number;
  readonly invuln: number;
  readonly grace: number;
  readonly phase: number;
  readonly variant: number;
}
export interface MonsterView extends ObstacleView { readonly mob?: MobView }

const MONSTER_KINDS = new Set(['hopper', 'swooper', 'spitter', 'brute', 'splitter', 'boss']);
export const isMonsterView = (o: ObstacleView): boolean => MONSTER_KINDS.has(o.type);

const eye = (g: G, x: number, y: number, r: number, look: number, angry = false) => {
  oval(g, x, y, r, r * 1.1, '#fbffd8', INK, 1.3);
  oval(g, x + look * r * .35, y + r * .1, r * .42, r * .55, INK);
  if (angry) line(g, INK, 2, [[x - r * 1.1, y - r * 1.3], [x + r * 1.1, y - r * .7 * (look || 1)]]);
};

/** Draws one monster. `t` is the animation clock (0 under reduced motion). */
export function drawMonster(g: G, o: ObstacleView, t: number): void {
  const m = (o as MonsterView).mob;
  const blink = m && m.grace > 0 && t % 8 < 4 ? .5 : 1;
  withAlpha(blink, () => {
    switch (o.type) {
      case 'hopper': drawHopper(g, o, m, t); break;
      case 'swooper': drawSwooper(g, o, m, t); break;
      case 'spitter': drawSpitter(g, o, m, t); break;
      case 'brute': drawBrute(g, o, m, t); break;
      case 'splitter': drawSplitter(g, o, m, t); break;
      case 'boss': drawBoss(g, o, m, t); break;
    }
  });
}

function drawHopper(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const x = o.wx + o.w / 2;
  const base = o.y + o.h;
  const dir = m?.dir ?? -1;
  // Squash on landing, stretch in the air.
  const squash = m?.air ? -.12 : m && m.land < 10 ? .22 * (1 - m.land / 10) : Math.sin(t * .2 + (o.phase ?? 0)) * .04;
  const rx = o.w / 2 * (1 + squash);
  const ry = o.h / 2 * (1 - squash);
  oval(g, x, base + 1, o.w * .42, 3, '#00000044');
  // Back legs.
  for (const s of [-1, 1]) line(g, INK, 5, [[x + s * rx * .6, base - ry * .6], [x + s * rx * 1.05, base - (m?.air ? 10 : 2)], [x + s * rx * .7, base]], true);
  for (const s of [-1, 1]) line(g, '#4ec25a', 3, [[x + s * rx * .6, base - ry * .6], [x + s * rx * 1.05, base - (m?.air ? 10 : 2)], [x + s * rx * .7, base]], true);
  oval(g, x, base - ry, rx, ry, '#7cf07a', INK, 2);
  oval(g, x, base - ry * .6, rx * .7, ry * .45, '#c9ffb0');
  for (const s of [-1, 1]) eye(g, x + s * rx * .42 + dir * 2, base - ry * 1.75, 5.2, dir);
  arc(g, INK, 2, x + dir * 3, base - ry * .95, rx * .45, ry * .25, .3, Math.PI - .3);
}

function drawSwooper(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const x = o.wx + o.w / 2;
  const y = o.y + o.h / 2;
  const diving = m?.state === 'dive';
  const dir = m?.dir ?? -1;
  const flap = diving ? -.2 : Math.sin(t * .45 + (o.phase ?? 0));
  const span = diving ? o.w * .45 : o.w * .75;
  for (const s of [-1, 1]) {
    const tipY = y - 10 * flap;
    shape(g, '#6b4bc2', [
      [x + s * 6, y - 4], [x + s * span * .55, tipY - 8], [x + s * span, tipY], [x + s * span * .78, y + 4],
      [x + s * span * .5, y + 1], [x + s * span * .3, y + 7], [x + s * 6, y + 5],
    ], INK, 1.6);
  }
  oval(g, x, y, 11, 10, '#b48cff', INK, 2);
  for (const s of [-1, 1]) shape(g, '#b48cff', [[x + s * 4, y - 8], [x + s * 8, y - 16], [x + s * 9, y - 6]], INK, 1.4);
  if (diving) glowOval(g, x + dir * 3, y - 2, 4, 3, '#ff5c8a', 4, .5, 3);
  for (const s of [-1, 1]) oval(g, x + s * 4 + dir * 2, y - 2, 2.2, 2.4, diving ? '#ff5c8a' : '#fff6b0');
  shape(g, '#ffffff', [[x - 3, y + 5], [x - 1.5, y + 9], [x, y + 5], [x + 1.5, y + 9], [x + 3, y + 5]]);
}

function drawSpitter(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const x = o.wx + o.w / 2;
  const base = o.y + o.h;
  const dir = m?.dir ?? -1;
  const wind = m?.state === 'wind' ? Math.min(1, m.t / 26) : 0;
  // Rooted pot.
  shape(g, '#4a5a2a', [[x - 18, base], [x - 14, base - 16], [x + 14, base - 16], [x + 18, base]], INK, 2);
  rect(g, '#6c7d36', x - 15, base - 19, 30, 5);
  line(g, INK, 6, [[x, base - 18], [x - dir * 3, base - 30], [x, o.y + 20]]);
  line(g, '#8fa83e', 3.5, [[x, base - 18], [x - dir * 3, base - 30], [x, o.y + 20]]);
  // Bulb head that swells before it spits.
  const r = 15 + wind * 4 + Math.sin(t * .1 + (o.phase ?? 0)) * .8;
  const hx = x + dir * 2;
  const hy = o.y + 15;
  if (wind) glowOval(g, hx, hy, r, r * .9, '#e8ff5a', 6, .25 + wind * .3, 3);
  oval(g, hx, hy, r, r * .88, '#d6e64a', INK, 2);
  for (let i = 0; i < 3; i++) oval(g, hx - dir * (4 + i * 4), hy - 6 + i * 4, 1.8, 1.6, '#97a524');
  // Mouth facing the target.
  oval(g, hx + dir * r * .62, hy + 2, 5 + wind * 3, 4 + wind * 3, '#3b1730', INK, 1.4);
  oval(g, hx + dir * r * .62, hy + 3, 2.5 + wind * 2, 1.6 + wind, '#b8f04a');
  eye(g, hx - dir * 1, hy - 7, 3.6, dir, wind > 0);
}

function drawBrute(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const x = o.wx + o.w / 2;
  const base = o.y + o.h;
  const dir = m?.dir ?? -1;
  const charging = m?.state === 'charge';
  const turning = m?.state === 'turn';
  const step = Math.sin(t * (charging ? .4 : .2) + (o.phase ?? 0));
  oval(g, x, base + 1, o.w * .48, 3.5, '#00000044');
  // Legs.
  for (const s of [-1, 1]) rect(g, '#7a4a2c', x + s * 12 - 6, base - 16 + (s * step > 0 ? -2 : 0), 12, 16);
  // Body.
  shape(g, '#c06c38', [[x - 24, base - 14], [x - 27, o.y + 22], [x - 14, o.y + 6], [x + 14, o.y + 6], [x + 27, o.y + 22], [x + 24, base - 14]], INK, 2.2);
  oval(g, x - dir * 6, o.y + 34, 12, 14, '#e0894a');
  // Horns.
  for (const s of [-1, 1]) shape(g, '#f6e6c4', [[x + s * 10, o.y + 9], [x + s * 18, o.y - 4], [x + s * 15, o.y + 11]], INK, 1.4);
  eye(g, x + dir * 8, o.y + 20, 4, dir, true);
  // Front armor plate (the side it faces): shots from this side bounce off.
  const px = x + dir * 24;
  const plate: [number, number][] = [[px, o.y + 8], [px + dir * 9, o.y + 18], [px + dir * 10, base - 12], [px, base - 4], [px - dir * 4, base - 30]];
  shape(g, '#8d97a8', plate, INK, 2.2);
  line(g, '#e6ecf5', 1.6, [[px + dir * 3, o.y + 14], [px + dir * 6, base - 16]]);
  for (const k of [0, 1, 2]) oval(g, px + dir * 5, o.y + 22 + k * 12, 1.6, 1.6, '#3a3f4a');
  if (o.flash && o.flash < 4) glowOval(g, px + dir * 6, o.y + o.h / 2, 6, o.h * .35, '#fff2b0', 4, .6, 3);
  if (turning) {
    // Slow turn telegraph: a little dust and a "huff".
    withAlpha(.6, () => oval(g, x - dir * 26, base - 4, 6 + (m?.t ?? 0) * .1, 3, '#d8c3a8'));
  }
  if (charging) for (const k of [0, 1, 2]) line(g, '#ffd9a8', 1.4, [[x - dir * (30 + k * 6), o.y + 20 + k * 12], [x - dir * (44 + k * 6), o.y + 20 + k * 12]]);
}

function drawSplitter(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const x = o.wx + o.w / 2;
  const base = o.y + o.h;
  const small = Boolean(m?.small);
  const wob = Math.sin(t * (small ? .3 : .13) + (o.phase ?? 0));
  const rx = o.w / 2 * (1 + wob * .06);
  const ry = o.h / 2 * (1 - wob * .06);
  oval(g, x, base + 1, o.w * .44, 3, '#00000044');
  oval(g, x, base - ry, rx, ry, small ? '#ff9ccc' : '#ff7ab8', INK, 2);
  if (!small) {
    // Seam where it will split, and two faces.
    line(g, '#b03d78', 2, [[x, o.y + 3], [x + 3, o.y + o.h * .35], [x - 2, o.y + o.h * .65], [x, base - 2]]);
    for (const s of [-1, 1]) {
      eye(g, x + s * rx * .45, base - ry * 1.25, 4.4, s);
      arc(g, INK, 1.8, x + s * rx * .45, base - ry * .7, 5, 3, .3, Math.PI - .3);
    }
  } else {
    eye(g, x + (m?.dir ?? 1) * 3, base - ry * 1.2, 3.6, m?.dir ?? 1);
  }
  withAlpha(.5, () => oval(g, x - rx * .4, base - ry * 1.45, rx * .22, ry * .16, '#ffffff'));
}

const BOSS_SKIN = [
  { body: '#7a2a5e', belly: '#c4579a', plate: '#3c1236', glow: '#ff4f9a', eye: '#ffe36b' },
  { body: '#3a1f6e', belly: '#7a4bd6', plate: '#1a0d36', glow: '#ff4f6d', eye: '#9fffe8' },
] as const;

function drawBoss(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const final = m?.variant === 1;
  const skin = BOSS_SKIN[final ? 1 : 0];
  const dir = m?.dir ?? -1;
  const state = m?.state ?? 'sleep';
  const jitter = state === 'charge' && t ? Math.sin(t * 1.7) * 2.5 : 0;
  const x = o.wx + o.w / 2 + jitter;
  const base = o.y + o.h;
  const top = o.y;
  const phase = m?.phase ?? 1;
  const breath = Math.sin(t * .06) * 2;
  const rage = state === 'phase' || phase === 3;
  oval(g, x, base + 2, o.w * .55, 5, '#00000055');
  glowOval(g, x, top + o.h * .5, o.w * .5, o.h * .5, skin.glow, 10 + phase * 3, rage ? .4 : .22, 4);
  // Legs.
  for (const s of [-1, 1]) shape(g, skin.plate, [[x + s * o.w * .18, base - 26], [x + s * o.w * .42, base - 8], [x + s * o.w * .4, base], [x + s * o.w * .14, base]], INK, 2);
  // Body.
  const bw = o.w * .5;
  shape(g, skin.body, [
    [x - bw, base - 12], [x - bw - 6, top + o.h * .45], [x - bw * .7, top + 14 - breath], [x, top - breath],
    [x + bw * .7, top + 14 - breath], [x + bw + 6, top + o.h * .45], [x + bw, base - 12],
  ], INK, 2.6);
  oval(g, x - dir * 6, top + o.h * .62, bw * .62, o.h * .26, skin.belly);
  for (let i = 0; i < 4; i++) line(g, skin.plate, 2, [[x - dir * 6 - bw * .5, top + o.h * (.5 + i * .08)], [x - dir * 6 + bw * .5, top + o.h * (.5 + i * .08)]]);
  // Crown spikes (one more per phase).
  const spikes = 2 + phase;
  for (let i = 0; i < spikes; i++) {
    const sx = x - bw * .6 + (bw * 1.2) * (i / Math.max(1, spikes - 1));
    shape(g, final ? '#9fffe8' : '#ffd36b', [[sx - 6, top + 10 - breath], [sx, top - 14 - breath - (i % 2) * 6], [sx + 6, top + 10 - breath]], INK, 1.6);
  }
  // Eyes: closed while asleep.
  const ey = top + o.h * .3;
  for (const s of [-1, 1]) {
    const ex = x + dir * 12 + s * 16;
    if (state === 'sleep') line(g, INK, 3, [[ex - 7, ey], [ex + 7, ey]]);
    else {
      glowOval(g, ex, ey, 7, 6, skin.eye, 4, rage ? .6 : .3, 3);
      oval(g, ex, ey, 7, 6, skin.eye, INK, 1.6);
      oval(g, ex + dir * 2, ey, 2.4, 3.6, INK);
    }
  }
  // Mouth: opens for a volley.
  const open = state === 'volley' ? Math.min(1, (m?.t ?? 0) / 30) : state === 'summon' ? .7 : .15;
  const mx = x + dir * bw * .55;
  oval(g, mx, top + o.h * .48, 12, 3 + open * 10, '#2a0b1e', INK, 2);
  if (open > .3) for (const k of [-1, 0, 1]) shape(g, '#ffffff', [[mx + k * 6 - 2, top + o.h * .48 - open * 8], [mx + k * 6, top + o.h * .48 - open * 3], [mx + k * 6 + 2, top + o.h * .48 - open * 8]]);
  if (state === 'volley' && (m?.t ?? 0) < 30) glowOval(g, mx + dir * 6, top + o.h * .48, 5, 5, skin.glow, 6, .6, 3);
  if (state === 'charge') dashed(g, '#ff8196ad', 2, x + dir * bw, base - 20, x + dir * (bw + 160), base - 20, 9, 7);
  if (state === 'dash') for (const k of [0, 1, 2, 3]) line(g, '#ffd9e6', 2, [[x - dir * (bw + 8 + k * 8), top + 20 + k * 22], [x - dir * (bw + 40 + k * 8), top + 20 + k * 22]]);
  // Invulnerability flash.
  if (m && (m.invuln > 6 || state === 'phase') && t % 8 < 4) withAlpha(.45, () => oval(g, x, top + o.h * .5, o.w * .55, o.h * .52, '#ffffff'));
  if (state !== 'sleep') drawBossBar(g, o, x, final);
}

/** Small HP bar above the boss (the HUD shows the big one). */
function drawBossBar(g: G, o: ObstacleView, x: number, final: boolean): void {
  const w = Math.max(90, o.w * 1.1);
  const y = o.y - 30;
  rect(g, INK, x - w / 2 - 2, y - 2, w + 4, 9);
  rect(g, '#3b1a2a', x - w / 2, y, w, 5);
  rect(g, final ? '#ff4f6d' : '#ff7ab8', x - w / 2, y, w * Math.max(0, o.hp / o.maxHp), 5);
  for (const k of [1, 2]) rect(g, INK, x - w / 2 + w * k / 3 - .5, y, 1, 5);
  strokeRect(g, '#ffd3e0', 1, x - w / 2 - 1, y - 1, w + 2, 7);
}

/** Goo blobs (spitter) and boss orbs. Plain drone shots are drawn by drawPulse. */
export function drawMonsterShot(g: G, s: EnemyShotView, t: number): void {
  if (s.style === 'goo') {
    const vy = s.vy ?? 0;
    const tilt = Math.atan2(vy, s.vx);
    glowOval(g, s.x, s.y, 6, 5, '#d6e64a', 4, .35, 3);
    oval(g, s.x, s.y, 7.5, 5.5, '#b8e03a', INK, 1.6, tilt);
    oval(g, s.x - 1.5, s.y - 1.5, 2, 1.4, '#f5ffc2');
    oval(g, s.x - Math.cos(tilt) * 9, s.y - Math.sin(tilt) * 9, 2.4, 2.4, '#b8e03a');
    return;
  }
  const r = 7 + Math.sin(t * .4 + s.x * .05) * 1;
  glowOval(g, s.x, s.y, r, r, '#ff4f6d', 6, .45, 4);
  oval(g, s.x, s.y, r, r, '#ff4f9a', INK, 1.6);
  oval(g, s.x, s.y, r * .45, r * .45, '#fff0f6');
  line(g, '#ff9ab8', 2, [[s.x - Math.sign(s.vx) * r, s.y], [s.x - Math.sign(s.vx) * (r + 14), s.y]]);
}

/** Red lattice over the exit portal while a boss lives. */
export function drawPortalSeal(g: G, x: number, y: number, t: number): void {
  const pulse = t ? .5 + .5 * Math.sin(t * .08) : .5;
  glowOval(g, x, y, 54, 104, '#ff3b5c', 10, .2 + pulse * .15, 4);
  for (let i = -2; i <= 2; i++) {
    line(g, INK, 6, [[x + i * 18, y - 96 + Math.abs(i) * 10], [x + i * 18, y + 96 - Math.abs(i) * 10]]);
    line(g, '#ff5c7a', 3, [[x + i * 18, y - 96 + Math.abs(i) * 10], [x + i * 18, y + 96 - Math.abs(i) * 10]]);
  }
  for (const k of [-1, 0, 1]) line(g, '#ff9ab0', 2, [[x - 44, y + k * 50], [x + 44, y + k * 50]]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + t * .02;
    oval(g, x + Math.cos(a) * 46, y + Math.sin(a) * 90, 2.2, 2.2, '#ffe0e8');
  }
  oval(g, x, y, 13, 13, '#2a0b1e', '#ff5c7a', 2.4);
  rect(g, '#ff5c7a', x - 4, y - 2, 8, 9);
  arc(g, '#ff5c7a', 2.4, x, y - 3, 5, 6, Math.PI, TAU);
}

/** drawWorld hook: the portal seal (drawn right after the portal). */
export function drawEnemyBackLayer(g: G, obstacles: readonly ObstacleView[], exit: number, portalY: number, t: number): void {
  if (obstacles.some((o) => o.type === 'boss' && !o.broken)) drawPortalSeal(g, exit, portalY, t);
}
