import type { ObstacleView } from './view';
import { crystalShards } from '../../core/world';
import { type G, INK, dashed, glowOval, line, oval, rect, shape, withAlpha } from './prims';
import { ink, stroke } from './creatureInk';

/** The faceted hull is also the collision polygon. */
export function drawCrystal(g: G, o: ObstacleView, x: number, t: number): void {
  const hot = (o.tint ?? 0) > .55;
  const base = o.y + o.h;
  const pulse = .5 + .5 * Math.sin(t * .07 + x);
  oval(g, x + o.w / 2, base, o.w * .54, 2.6, '#25162b8c');
  crystalShards(o, x).forEach((hull) => {
    const [left, shoulder, tip, rightShoulder, right] = hull;
    const width = right[0] - left[0], height = base - tip[1];
    const ridge = left[0] + width * .43, waist = base - height * .42;
    shape(g, hot ? '#d32e50' : '#f55035', hull, INK, 2);
    shape(g, hot ? '#ff6782' : '#ff9670', [shoulder, tip, [ridge, waist]]);
    shape(g, hot ? '#771945' : '#a03338', [tip, rightShoulder, right, [ridge, base - 1], [ridge, waist]]);
    shape(g, '#ffe0a8', [shoulder, tip, [ridge + 1, base - height * .63]]);
    shape(g, hot ? '#f33e66' : '#f96944', [[ridge, waist], rightShoulder, [ridge + 2, waist + height * .19], [ridge, base - 1]]);
    line(g, '#ffe8bf', 1.15, [[left[0] + width * .17, base - height * .30], [ridge, waist], [ridge + width * .10, waist - 1]]);
    line(g, '#50203c', 1.2, [[ridge, waist + 2], [ridge, base - 1]]);
    withAlpha(.4 + .4 * pulse, () => line(g, '#fff6d4', 1.4, [[tip[0], tip[1] + 2], [tip[0] - 2, tip[1] + 8]]));
  });
}

export function drawDrone(g: G, o: ObstacleView, x: number, t: number): void {
  const y = o.y + o.h / 2, cx = x + o.w / 2;
  const aim = o.aim || -1;
  if (o.charge) dashed(g, '#ff8099c4', o.charge < 12 ? 2.3 : 1.2, cx, y, cx + aim * (190 - o.charge * 2.7), y, 7, 6);
  g.save();
  g.translateCanvas(cx, y);
  g.scaleCanvas(-aim, 1);
  // A tiny pilot leans over the controls inside the glass bubble.
  ink(g, '#315461', '-13 0/-14 -12 -4 -14/8 -17 14 -7/16 -3 14 0');
  ink(g, '#83dcd4', '-12 -1/-12 -11 -4 -12/7 -15 12 -6/6 -9 -1 -5/-6 -1 -12 -1', 0);
  ink(g, '#83ad65', '-6 0/-8 -5 -4 -8/-1 -11 3 -8/7 -8 8 -5/7 -2 5 1', 1.1);
  oval(g, -3.7, -6, 2.8, 2.25, '#ffeeb7', INK, .9);
  oval(g, -4.7, -6, .95, 1.1, INK);
  stroke(g, '#f4fff1', 1.45, '-10 -6/-8 -11 -4 -11');
  // Bell and vented skirt cast one solid shadow beneath the enamel body.
  ink(g, '#46616b', '-16 4/-12 12 -5 12/7 14 16 7/17 2');
  ink(g, '#f99457', '-9 9/-5 13 3 12/7 12 10 9', 1.15);
  const flutter = Math.sin(t * .29);
  oval(g, 0, 13 + flutter, 4.9, 1.45, '#ffdfa8');
  ink(g, o.volley ? '#e97971' : '#e8a572', '-23 2/-20 -4 -10 -5/6 -7 18 -3/24 -1 23 3/15 7 0 8/-16 9 -23 4');
  ink(g, '#a84b57', '-23 3/-6 6 9 2/19 0 23 0/23 4 19 5/4 10 -14 7', 0);
  stroke(g, '#ffe6bd', 1.3, '-18 -1/-10 -4 0 -4');
  for (const offset of [-8, 0, 8]) oval(g, offset, 3 - offset * .055, 1.4, 1.1, o.charge ? '#fff7a9' : '#a8f0d9', INK, .65);
  if (o.volley) {
    ink(g, '#475463', '-22 1/-16 0/-13 3/-15 6/-22 6', 1.25);
    oval(g, -21.5, 3.5, 2, 2.7, o.charge ? '#ffe994' : '#fa836f', INK, 1);
    if (o.charge) glowOval(g, -22, 3, 2, 2, '#ffba7b', 3.5, .6, 3);
  }
  g.restore();
}

export function drawWall(g: G, o: ObstacleView): void {
  const { w, h } = o;
  g.save();
  g.translateCanvas(o.wx, o.y);
  rect(g, INK, 0, 0, w, h);
  rect(g, '#586175', 2, 3, w - 4, h - 4);
  rect(g, '#2c3549', w - 8, 3, 6, h - 4);
  rect(g, '#afc3c1', 3, 5, 1.7, h - 8);
  const count = 4, panel = (h - 18) / count;
  for (let i = 0; i < count; i++) {
    const y = 12 + i * panel;
    shape(g, o.flash ? '#c88b71' : '#71818b', [[6,y], [w-12,y], [w-8,y+6], [w-8,y+panel-8], [w-14,y+panel-3], [6,y+panel-3]], INK, 1.5);
    shape(g, '#445463', [[7,y+panel-16], [w-9,y+panel-30], [w-9,y+panel-8], [w-14,y+panel-4], [7,y+panel-4]]);
    line(g, '#c1cfbe', 1.2, [[8,y+3], [w-14,y+3]]);
    for (let vent = 0; vent < 3; vent++) line(g, '#263547', 1.8, [[10+vent*4,y+13], [13+vent*4,y+10]]);
    oval(g, w-13, y+panel-11, 1.6, 1.6, '#b4bcac', INK, .8);
  }
  // The orange mechanical latch and teeth tell the player where shots break the door.
  const mid = h * .50;
  shape(g, '#f7ad61', [[2,mid-15],[w-10,mid-15],[w-4,mid-9],[w-4,mid+13],[8,mid+13],[2,mid+8]], INK, 1.8);
  for (const n of [0, 1, 2]) shape(g, '#413646', [[5+8*n,mid+4],[9+8*n,mid+4],[14+8*n,mid+11],[10+8*n,mid+11]]);
  rect(g, '#282533', 7, mid-9, w-18, 8);
  const step = (w - 20) / o.maxHp;
  for (let i = 0; i < o.hp; i++) rect(g, '#fff0ac', 8 + i*step, mid-7, step-1, 4);
  const cracks = Math.min(4, o.maxHp - o.hp);
  for (let i = 0; i < cracks; i++) {
    const y = 12 + ((i+2)%4) * panel;
    const points = [[5,y+8],[19,y+19],[14,y+23],[24,y+36],[w-8,y+40]] as const;
    line(g, INK, 3.5, points);
    line(g, '#ffa470', 1.15, points);
  }
  g.restore();
}

export function drawSlime(g: G, o: ObstacleView, t: number): void {
  const wave = Math.sin(t * .12 + (o.phase ?? 0));
  g.save();
  g.translateCanvas(o.wx + o.w / 2, o.y + o.h);
  oval(g, 0, -.7, 23, 2.3, '#1916286b');
  g.scaleCanvas(1 + wave * .025, 1 - wave * .035);
  // A shore slug with a glassy mantle, a tall left eyestalk and a scalloped foot.
  ink(g, '#ac83c6', '-23 -5/-25 -9 -19 -13/-17 -26 -12 -29/-16 -36 -10 -40/-4 -44 0 -37/1 -34 -1 -31/5 -34 9 -30/15 -34 19 -29/21 -25 18 -22/16 -19 18 -15/20 -9 25 -8/27 -4 22 -3/19 -2 16 -4/10 2 5 -2/-1 2 -6 -2/-14 2 -16 -2/-23 -1 -23 -5');
  ink(g, '#765485', '-22 -9/-20 -13 -16 -15/-13 -7 -8 -7/-3 -10 1 -9/7 -10 12 -14/16 -18 18 -20/16 -13 22 -9/25 -8 24 -6/22 -3 16 -5/11 -1 6 -3/0 0 -5 -4/-12 0 -16 -4/-22 -1 -22 -9', 0);
  ink(g, '#daa5da', '-18 -15/-14 -26 -9 -28/-5 -30 -1 -26/-7 -25 -10 -21/-14 -15 -18 -15', 0);
  oval(g, -8.8, -33.3, 6.25, 6.9, '#f6edbc', INK, 1.6, -.22);
  oval(g, -11.3, -32.8, 2.1, 3.15, '#272434', undefined, 0, -.12);
  oval(g, -11.9, -34, .7, .8, '#fff7d5');
  oval(g, 11.8, -26.1, 5.5, 5.3, '#f6edbc', INK, 1.5, -.24);
  oval(g, 9.6, -25.5, 1.8, 2.65, '#272434');
  stroke(g, '#62436d', 1.4, '-16 -32/-15 -40 -9 -40');
  ink(g, '#3d273d', '-14 -17/-7 -15 0 -18/6 -20 11 -18/7 -11 0 -11/-8 -10 -14 -17', 1.25);
  ink(g, '#fff0cc', '-9 -15/-4 -15/-6 -11', .7);
  ink(g, '#fff0cc', '4 -17/8 -18/5 -13', .7);
  stroke(g, '#e4b2e5', 1.3, '-8 -6/-4 -7 -2 -6');
  for (const [x,y] of [[-18,-11],[2,-25],[16,-10]]) oval(g, x, y, 1.2, .85, '#7c538a');
  g.restore();
}

/** Short impact streaks stay readable over pale skin and dark armor. */
export function drawHitFlash(g: G, o: ObstacleView): void {
  const x = o.wx + o.w / 2, y = o.y + o.h / 2;
  withAlpha(.68, () => {
    for (const s of [-1, 1]) {
      line(g, '#fff4c7', 2, [[x+s*o.w*.3,y-o.h*.12], [x+s*o.w*.49,y-o.h*.22]]);
      line(g, '#fff4c7', 1.45, [[x+s*o.w*.34,y+o.h*.15], [x+s*o.w*.47,y+o.h*.2]]);
    }
  });
}
