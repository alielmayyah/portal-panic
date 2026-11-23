import type { EnemyShotView, ObstacleView } from './view';
import { type G, INK, TAU, arc, dashed, glowOval, line, oval, rect, shape, withAlpha } from './prims';
import { ink, stroke } from './creatureInk';
import { drawBoss } from './creatureBosses';

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

export function drawMonster(g: G, o: ObstacleView, t: number): void {
  const m = (o as MonsterView).mob;
  if (o.type === 'boss') { drawBoss(g, o, m, t); return; }
  g.save();
  g.translateCanvas(o.wx + o.w / 2, o.y + o.h);
  g.scaleCanvas(-(m?.dir || -1), 1);
  const time = t ? t + (o.phase ?? 0) : 0;
  withAlpha(m && m.grace > 0 && t % 8 < 4 ? .55 : 1, () => {
    switch (o.type) {
      case 'hopper': drawHopper(g, m, time); break;
      case 'swooper': drawSwooper(g, m, time); break;
      case 'spitter': drawSpitter(g, m, time); break;
      case 'brute': drawBrute(g, o, m, time); break;
      case 'splitter': drawSplitter(g, m, time); break;
    }
  });
  g.restore();
}

function drawHopper(g: G, m: MobView | undefined, t: number): void {
  const squash = m?.air ? -.08 : m && m.land < 10 ? .16 * (1 - m.land / 10) : Math.sin(t * .12) * .035;
  g.scaleCanvas(1 + squash, 1 - squash);
  // A shovel-jawed toad with a folded spring leg. The toes trail behind in flight.
  ink(g, '#457d66', '-9 -12/-12 -6/-11 -4/-5 -3/-6 0/-16 0/-17 -3/-14 -14');
  ink(g, '#77be79', '-18 -20/-15 -31 -6 -30/-3 -34 0 -34/1 -31/6 -33/8 -29/13 -29 17 -23/23 -17 17 -10/10 -4 -1 -5/-13 -5 -19 -12/-23 -18 -18 -20');
  ink(g, '#539879', '-18 -13/-7 -11 -1 -15/6 -23 16 -22/20 -18 17 -12/10 -6 0 -6/-15 -5 -18 -13', 0);
  ink(g, '#d2dc99', '-20 -16/-11 -13 -4 -17/1 -19 6 -17/2 -9 -8 -8/-17 -8 -20 -16', 1.35);
  stroke(g, '#586b51', 1.1, '-16 -12/-12 -10 -8 -11');
  oval(g, -9.4, -25.2, 6.6, 7.1, '#f5d988', INK, 1.65, .16);
  oval(g, -11.2, -24.8, 3.6, 1.4, INK, undefined, 0, -.2);
  ink(g, '#8acb83', '-16 -26/-15 -35 -8 -33/-3 -32 -2 -27/-9 -30 -16 -26', 1.25);
  oval(g, -18, -19, 1.3, .9, INK);
  ink(g, '#7fbd71', '3 -17/6 -25 13 -24/21 -23 18 -16/15 -12 8 -9/13 -7/9 -5/1 -8/-2 -11/5 -15');
  stroke(g, '#c7db8f', 1.35, '6 -20/10 -24 14 -21');
  g.save();
  g.translateCanvas(8, -8);
  if (m?.air) g.rotateCanvas(-.45);
  ink(g, '#86c78c', '0 -1/7 0/11 4/14 4/13 6/16 7/7 7/3 5/-2 4');
  g.restore();
  oval(g, 3, -25, 1.35, 1, '#466b5f');
}

function drawSwooper(g: G, m: MobView | undefined, t: number): void {
  const diving = m?.state === 'dive';
  const flap = Math.sin(t * .29);
  g.translateCanvas(0, -13);
  if (diving) g.rotateCanvas(-.16);
  // Asymmetric, scalloped moth wings give the banking sprite a three-quarter view.
  g.save();
  g.rotateCanvas(diving ? -.36 : flap * .18);
  ink(g, '#8f73b8', '-3 -1/-13 -13 -27 -13/-23 -8 -24 -4/-16 -7 -14 0/-10 -3 -7 5/0 4');
  stroke(g, '#d1add3', 1.15, '-24 -11/-15 -10 -9 -4');
  g.restore();
  g.save();
  g.rotateCanvas(diving ? .28 : -flap * .25);
  ink(g, '#af82cd', '1 0/8 -11 18 -14/25 -16 30 -15/26 -12 24 -5/19 -7 16 0/11 -2 8 6/5 3 2 6');
  ink(g, '#614f85', '3 3/13 -8 23 -12/19 -7 16 -2/11 -3 8 4/6 3 4 5', 0);
  stroke(g, '#e4c5ed', 1.15, '5 -2/13 -10 19 -11');
  g.restore();
  ink(g, '#6d547d', '-5 -7/-7 -14/-3 -12/2 -8/7 -11/10 -13/9 -6/5 -3');
  ink(g, '#e0b7cc', '-9 -5/-5 -10 2 -8/10 -7 10 0/9 5 4 7/2 13/-2 8/-6 10/-7 5/-12 2');
  ink(g, '#afa6c9', '0 7/5 3 6 -4/11 -1 8 4/5 6 4 7/2 11', 0);
  oval(g, -2, -.9, 6.15, 5.45, diving ? '#ff906d' : '#ffe398', INK, 1.55, -.2);
  oval(g, -3.4, -1, 1.65, 3.2, INK);
  stroke(g, '#65485f', 1.15, '-9 -4/-4 -9 2 -6');
  if (diving) line(g, '#f0c0da', 1.25, [[12,2],[22,0]]);
}

function drawSpitter(g: G, m: MobView | undefined, t: number): void {
  const wind = m?.state === 'wind' ? Math.min(1, m.t / 26) : 0;
  // Bile pitcher growing out of a knotted, coral-shaped root.
  ink(g, '#4c8c79', '-17 0/-16 -5 -11 -5/-12 -10 -19 -12/-10 -12 -3 -8/-4 -18 -1 -25/2 -28 8 -27/9 -23 5 -17/2 -13 4 -9/8 -15 16 -16/10 -12 11 -7/18 -10 21 -6/13 -5 18 -1/9 -2 6 -1/0 -4 -6 -1/-10 -2 -17 0');
  stroke(g, '#a4cf8f', 1.4, '1 -10/-3 -12 3 -24');
  g.save();
  g.translateCanvas(3, -29);
  g.rotateCanvas(-.055 + Math.sin(t * .09) * .04 - wind * .09);
  g.scaleCanvas(1 + wind * .08, 1 + wind * .08);
  ink(g, '#9cb95a', '-14 -12/-7 -15 -3 -18/-4 -14/-1 -15/6 -21 13 -18/9 -15 8 -12/15 -13 19 -9/14 -8 13 -4/19 -3 19 1/13 0 10 3/8 12 -2 13/-10 12 -12 3/-11 -2 -16 -4');
  ink(g, '#d3cf71', '-16 -10/-5 -13 -1 -8/6 -3 5 3/5 8 -1 10/-9 11 -11 4/-11 -2 -16 -4', 0);
  ink(g, '#708e55', '4 9/10 5 10 -2/9 -7 6 -8/13 -6 14 -8/11 -4 12 -2/16 -1 17 0/11 -1 9 5/6 12 -2 12', 0);
  // Rolled trumpet lip points toward the projectile's launch position.
  oval(g, -14.8, -7.3, 5.6, 8.2, '#f79d82', INK, 1.75, -.52);
  oval(g, -15.6, -7.7, 3.15, 5.6, '#4b3840', INK, .9, -.52);
  oval(g, -14.8, -6, 1.8 + wind, 2.2 + wind, '#c3e777', undefined, 0, -.5);
  oval(g, -.5, -8.2, 4.1, 4.45, '#fff0be', INK, 1.3);
  oval(g, -1.9, -8, 1.35, 2.25, INK);
  stroke(g, '#655742', 1.25, '-5 -10/-2 -15 2 -12');
  for (const [x,y] of [[2,3],[6,0],[0,6]]) oval(g, x,y,1.1,1.5,'#888d50');
  if (wind) glowOval(g, -16, -7, 4, 4, '#e6ff8e', 5, wind * .7, 3);
  g.restore();
}

function drawBrute(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const charge = m?.state === 'charge';
  const stride = m?.state === 'turn' ? 0 : Math.sin(t * (charge ? .31 : .14));
  for (const side of [-1,1]) {
    g.save();
    g.translateCanvas(side * 11, -12);
    g.rotateCanvas(side * stride * .23);
    ink(g, side < 0 ? '#9b604c' : '#c67b57', '-6 -5/4 -6/6 2/3 7/7 9/7 12/-7 12/-9 10/-6 5');
    g.restore();
  }
  g.translateCanvas(0, -Math.abs(stride) * 1.7);
  // A terracotta pack-beast with an ivory beak under the shell and a full riot shield.
  ink(g, '#c27957', '-20 -40/-19 -52 -9 -58/4 -68 16 -58/28 -51 26 -35/25 -21 18 -12/3 -7 -9 -13/-20 -18 -20 -40');
  ink(g, '#93574e', '-16 -28/-6 -31 1 -26/12 -29 22 -40/25 -29 19 -17/12 -10 3 -12/-12 -10 -16 -22', 0);
  ink(g, '#dc8e61', '-13 -45/-17 -57 -3 -62/10 -68 18 -61/28 -58 28 -43/24 -48 20 -48/17 -42 13 -39/10 -46 6 -45/3 -39 -3 -39/-4 -45 -9 -42');
  stroke(g, '#ffcb91', 1.5, '-9 -55/-2 -62 6 -62');
  stroke(g, '#91604f', 1.25, '9 -59/16 -56 17 -48');
  ink(g, '#e8c895', '-18 -44/-12 -49 -3 -46/2 -44 0 -37/-6 -31 -15 -30/-22 -31 -23 -34/-18 -34 -17 -37/-24 -35 -24 -39');
  oval(g, -10, -42, 4.2, 3.8, '#ffdb81', INK, 1.2);
  oval(g, -11.3, -42, 1.45, 2.2, INK);
  ink(g, '#bd7459', '-19 -46/-14 -51 -5 -49/-2 -48 -2 -45/-11 -46 -18 -42', 1.45);
  ink(g, '#d58c62', '8 -39/15 -44 21 -36/26 -29 21 -23/16 -20 12 -25/10 -32 6 -31');
  stroke(g, '#875047', 1.3, '15 -37/19 -34 19 -30');
  // Raised in the direction from which bullets are deflected.
  ink(g, o.flash && o.flash < 4 ? '#fff0a4' : '#789c9d', '-28 -46/-25 -52 -19 -51/-12 -48 -11 -41/-9 -27 -14 -13/-19 -7 -24 -6/-31 -17 -30 -31');
  ink(g, '#466876', '-26 -44/-23 -48 -20 -47/-14 -44 -14 -37/-13 -23 -19 -12/-21 -11 -23 -10/-21 -24 -23 -35', .95);
  stroke(g, '#c3d8bc', 1.6, '-27 -38/-28 -45 -24 -48');
  stroke(g, '#f9b575', 2.0, '-26 -31/-21 -36 -18 -30/-16 -24 -21 -22/-25 -20 -24 -26/-23 -28 -21 -27');
  if (m?.state === 'turn') {
    withAlpha(.55, () => oval(g, -32, -37, 2.6 + m.t * .05, 1.7, '#f4d6af'));
  }
  if (charge) for (const k of [0,1,2]) line(g, '#ffe2ad', 1.5, [[24+k*2,-46+k*11],[34+k*4,-47+k*11]]);
}

function drawSplitter(g: G, m: MobView | undefined, t: number): void {
  const small = m?.small;
  const wob = Math.sin(t * (small ? .19 : .11));
  g.scaleCanvas((small ? .56 : 1) * (1 + wob * .035), (small ? .56 : 1) * (1 - wob * .045));
  // The juvenile keeps the parent's gummy lobes, eye and pigment.
  if (small) {
    ink(g, '#f09cb0', '-22 -5/-23 -11 -16 -18/-17 -28 -9 -34/-1 -40 9 -33/14 -30 14 -19/14 -12 22 -7/26 -2 19 -1/13 1 9 -3/0 2 -5 -2/-17 2 -22 -5');
    oval(g, -2, -24, 8.2, 8.7, '#ffeab8', INK, 1.9);
    oval(g, -4, -24, 2.8, 4.4, INK);
    stroke(g, INK, 1.8, '-12 -12/-5 -7 3 -12');
    return;
  }
  ink(g, '#e98ba4', '-25 -7/-28 -13 -21 -20/-25 -34 -15 -41/-5 -48 1 -39/7 -45 16 -40/26 -35 21 -24/20 -20 24 -16/32 -8 25 -4/19 -1 13 -4/9 1 1 -2/-7 1 -12 -3/-21 0 -25 -7');
  ink(g, '#b56083', '-24 -13/-17 -6 -9 -9/-3 -13 1 -12/6 -6 11 -8/18 -10 22 -18/22 -15 25 -13/29 -7 23 -5/16 -3 13 -6/9 -1 2 -4/-4 -1 -12 -5/-22 -1 -24 -9', 0);
  stroke(g, '#8c4d74', 1.8, '0 -38/4 -31 0 -24/-3 -19 1 -14/6 -9 1 -4');
  for (const side of [-1,1]) {
    g.save();
    g.scaleCanvas(side,1);
    oval(g, 11, -29, 7.55, 8.2, '#ffefc0', INK, 1.65, -.25);
    oval(g, 13, -28.7, 2.2, 3.8, INK);
    stroke(g, '#ffbece', 1.55, '7 -39/13 -42 17 -37');
    ink(g, '#713d5a', '5 -16/10 -14 18 -19/15 -12 10 -12/7 -12 5 -16', 1.1);
    ink(g, '#fff0c7', '12 -16/15 -17/13 -13', .65);
    g.restore();
  }
}

export function drawMonsterShot(g: G, s: EnemyShotView, t: number): void {
  g.save();
  g.translateCanvas(s.x, s.y);
  g.rotateCanvas(Math.atan2(s.vy ?? 0, s.vx));
  if (s.style === 'goo') {
    ink(g, '#b9d65e', '-10 -2/-6 -2 -3 -5/3 -9 7 -4/11 1 5 5/1 8 -4 4/-6 1 -10 2');
    oval(g, -13, 1, 2.15, 1.7, '#d1e583', INK, 1);
    stroke(g, '#f1f9b6', 1.25, '-1 -4/2 -6 5 -4');
  } else {
    const pulse = 1 + Math.sin(t * .28) * .06;
    g.scaleCanvas(pulse, pulse);
    glowOval(g, 0, 0, 6.2, 6.2, '#ff5e89', 6, .4, 3);
    ink(g, '#fb7892', '-18 0/-9 -2 -6 -5/-2 -10 5 -6/11 -2 7 4/4 9 -3 6/-8 3 -12 3/-8 1');
    oval(g, 1, 0, 4.2, 3.6, '#fff3bc', INK, 1);
    oval(g, 2, 0, 1.2, 2.6, '#b24968');
  }
  g.restore();
}

/** An iris seal overlays the exit while the boss lives. */
export function drawPortalSeal(g: G, x: number, y: number, t: number): void {
  const pulse = .5 + .5 * Math.sin(t * .08);
  oval(g, x,y,44,93,'#351937a8','#e97188',2.2);
  oval(g, x,y,38,84,null,'#ffb7a3',1);
  for (const offset of [-1,0,1]) {
    dashed(g,'#ff8199',1.6,x-32,y-34+offset*32,x+32,y+7+offset*32,5,3);
    dashed(g,'#ff8199',1.6,x-32,y+7+offset*32,x+32,y-34+offset*32,5,3);
  }
  for (let i=0; i<8; i++) {
    const a = TAU*i/8;
    oval(g,x+Math.cos(a)*42,y+Math.sin(a)*90,2.25,2.25,'#ffe8bb',INK,1);
  }
  glowOval(g,x,y,13,13,'#f26383',7,.2+pulse*.2,3);
  shape(g,'#4b2d48',[[x,y-17],[x+13,y-9],[x+13,y+9],[x,y+17],[x-13,y+9],[x-13,y-9]],'#ffd0aa',1.8);
  arc(g,'#ffcaac',2,x,y-2,4.1,5.5,Math.PI,TAU);
  rect(g,'#ffac9b',x-5.8,y-2,11.6,8.5);
  rect(g,INK,x-1,y+.7,2,3.6);
}

export function drawEnemyBackLayer(g: G, obstacles: readonly ObstacleView[], exit: number, portalY: number, t: number): void {
  if (obstacles.some((o) => o.type === 'boss' && !o.broken)) drawPortalSeal(g, exit, portalY, t);
}
