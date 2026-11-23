import { GADGET_COLORS, type RunnerView } from './view';
import { type G, type Pt, INK, glowOval, line, oval, rand, shape, withAlpha } from './prims';
import type { PilotPen } from './pilotArt';
import { drawPilot } from './pilotFigure';

export interface RunnerDrawOptions {
  shadow?: boolean;
  armed?: boolean;
  /** Animation clock for streak jitter and the god aura pulse (0 under reduced motion). */
  t?: number;
}

function graphicsPen(g: G): PilotPen {
  return {
    plate: (points, fill, edge, width = 1) => shape(g, fill, points, edge, width),
    stroke: (points, color, width) => line(g, color, width, points, points.length <= 3),
    oval: (x, y, rx, ry, fill, edge, width = 1) => oval(g, x, y, rx, ry, fill, edge, width),
    save: () => g.save(),
    restore: () => g.restore(),
    translate: (x, y) => g.translateCanvas(x, y),
    scale: (x, y) => g.scaleCanvas(x, y),
    rotate: (angle) => g.rotateCanvas(angle),
  };
}

/** Speed streaks behind a sliding runner, in facing space. */
function slideStreaks(g: G, sliding: number, t: number): void {
  withAlpha(Math.min(1, sliding / 10) * .6, () => {
    [-6, -15, -25].forEach((y, i) => {
      const len = 14 + rand(i * 5 + Math.floor(t / 3)) * 16 + (i === 0 ? 6 : 0);
      const x0 = -22 - i * 3;
      line(g, i === 1 ? '#ffffff' : '#e6d7f0', i === 0 ? 2 : 1.4, [[x0, y], [x0 - len, y]]);
    });
  });
}

function infinity(g: G, x: number, y: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const d = 1 + Math.sin(a) ** 2;
    pts.push([x + 6 * Math.cos(a) / d, y + 6 * Math.sin(a) * Math.cos(a) / d]);
  }
  line(g, INK, 3.2, pts);
  line(g, '#ffd86b', 1.6, pts);
}

export function drawRunner(g: G, r: RunnerView, { shadow = true, armed = false, t = 0 }: RunnerDrawOptions = {}): void {
  const x = r.x + 22;
  const sliding = r.grounded && (r.sliding ?? 0) > 0;
  const low = r.ducking || sliding;
  if (shadow && r.grounded) oval(g, x, r.feet + 2, low ? 23 : 15, 2.6, '#17182a60');
  if (r.god) {
    const pulse = t ? .5 + .5 * Math.sin(t * .12) : .5;
    glowOval(g, x, r.feet - (low ? 20 : 37), low ? 30 : 26, low ? 24 : 42, '#ffe27a', 8 + pulse * 4, .22 + pulse * .12);
  }
  if (r.shield) oval(g, x, r.feet - (low ? 20 : 37), low ? 31 : 29, low ? 25 : 44, '#71edf324', GADGET_COLORS.shield, 1.8);
  if (r.boots) {
    glowOval(g, x, r.feet - 3, 17, 4, '#dfa0ff', 5, .3, 3);
    oval(g, x, r.feet - 3, 17, 4, '#dfa0ff7a');
  }
  g.save();
  g.translateCanvas(x, r.feet);
  g.scaleCanvas(r.facing || 1, 1);
  if (sliding) slideStreaks(g, r.sliding ?? 0, t);
  drawPilot(graphicsPen(g), r, armed);
  g.restore();
  if (r.infiniteAmmo) infinity(g, x, r.feet - (low ? 54 : 86));
}
