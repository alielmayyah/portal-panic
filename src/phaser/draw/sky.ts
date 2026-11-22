// Background layer: sky gradient, stars, ringed planet, parallax ridges/towers and
// the low foreground props. Coordinates are view-relative in x (0..viewWidth) and
// world units in y, exactly as render.js draws them before translate(-camera).
// The caller puts this layer on scrollFactor (0, 1).
import { GROUND_Y, H, W, type LevelView } from './view';
import { type G, type Pt, arc, ellipsePoints, gradientRect, lerpColor, line, mod, oval, paint, rand, rect, shape, withAlpha } from './prims';

const stars = Array.from({ length: 105 }, (_, i) => [rand(i) * W, rand(i + 110) * 268, rand(i + 220) * 1.65 + .45] as const);

export function drawSky(g: G, camera: number, p: LevelView, viewWidth: number, viewTop: number): void {
  const left = -20, width = viewWidth + 40;
  rect(g, p.sky, left, viewTop - 20, width, 20);
  gradientRect(g, left, viewTop, width, GROUND_Y - viewTop, p.sky, p.haze, 32);
  rect(g, p.haze, left, GROUND_Y, width, H - GROUND_Y + 20);

  for (const [x, y, s] of stars) {
    const starY = viewTop + y / 268 * (268 - viewTop);
    withAlpha(s * .3, () => {
      for (let sx = mod(x - camera * .018, W); sx < viewWidth; sx += W) rect(g, '#ffe1bd', sx, starY, s, s);
    });
  }

  drawPlanet(g, viewWidth - 123 - mod(camera * .025, 100), 126, p);
}

/** Ringed planet with clipped bands; (x, y) is its centre. */
export function drawPlanet(g: G, x: number, y: number, p: LevelView): void {
  const R = 61;
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(-.29);
  withAlpha(.45, () => {
    for (const i of [0, 1, 2]) line(g, '#ffe1b5', 2, [...ellipsePoints(0, 0, 123 + i * 7, 24 + i * 4), ellipsePoints(0, 0, 123 + i * 7, 24 + i * 4)[0]]);
  });

  // Body: vertical gradient moon -> haze, as horizontal chord slices of the disc.
  const [top] = paint(p.moon);
  const [bottom] = paint(p.haze);
  const slices = 22;
  for (let i = 0; i < slices; i++) {
    const y1 = -R + 2 * R * i / slices, y2 = -R + 2 * R * (i + 1) / slices;
    const pts: Pt[] = [];
    const steps = 3;
    for (let k = 0; k <= steps; k++) {
      const yy = y1 + (y2 - y1) * k / steps;
      pts.push([Math.sqrt(Math.max(0, R * R - yy * yy)) + .3, yy]);
    }
    for (let k = steps; k >= 0; k--) {
      const yy = y1 + (y2 - y1) * k / steps;
      pts.push([-Math.sqrt(Math.max(0, R * R - yy * yy)) - .3, yy]);
    }
    const t = ((y1 + y2) / 2 + 62) / 124;
    g.fillStyle(lerpColor(top, bottom, t), 1);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.closePath();
    g.fillPath();
  }

  // Bands: ellipses centred at (8, yy) clipped to the disc.
  for (let i = 0; i < 8; i++) {
    const yy = -43 + i * 13;
    const ry = 3 + rand(i + 9) * 3;
    const hw = Math.sqrt(Math.max(0, R * R - yy * yy));
    const upper: Pt[] = [], lower: Pt[] = [];
    const n = 14;
    for (let k = 0; k <= n; k++) {
      const bx = -hw + 2 * hw * k / n;
      const f = Math.sqrt(Math.max(0, 1 - ((bx - 8) / 100) ** 2));
      const lim = Math.sqrt(Math.max(0, R * R - bx * bx));
      upper.push([bx, Math.max(-lim, Math.min(lim, yy - ry * f))]);
      lower.push([bx, Math.max(-lim, Math.min(lim, yy + ry * f))]);
    }
    withAlpha(.1 + rand(i) * .13, () => shape(g, i % 3 ? p.far : '#fff1c5', [...upper, ...lower.reverse()]));
  }
  withAlpha(.55, () => arc(g, '#ffe1b5', 2, 0, 0, 128, 28, .1, Math.PI - .1));
  g.restore();
}

export function drawRidges(g: G, camera: number, p: LevelView, viewWidth: number): void {
  const layers = [[p.far, .12, 322, 148, 172], [p.near, .32, 340, 95, 238]] as const;
  for (const [color, speed, base, height, span] of layers) {
    const scroll = camera * speed;
    for (let j = -1; j < viewWidth / span + 1; j++) {
      const i = j + Math.floor(scroll / span);
      const x = j * span - mod(scroll, span);
      const h = height * (.46 + rand(i + span) * .54);
      if (p.skyline === 'towers') {
        shape(g, color, [[x - 16, base], [x - 9, base - h * .6], [x + 22, base - h * .6], [x + 22, base - h], [x + span * .42, base - h], [x + span * .42, base - h * .72], [x + span * .69, base - h * .72], [x + span * .75, base], [x + span + 30, base]]);
        withAlpha(.24, () => {
          for (let k = 0; k < 6; k++) rect(g, p.rim, x + 28 + (k % 3) * 11, base - h + 10 + Math.floor(k / 3) * 9, 6, 2);
        });
      } else if (drawExtraSkyline(g, p, color, x, base, h, span, i)) {
        // New wave-2 skylines (spires, neon, swamp, islands, lair).
      } else {
        shape(g, color, [[x - 38, base], [x - 9, base - h * .22], [x + span * .14, base - h * .25], [x + span * .3, base - h * .82], [x + span * .57, base - h], [x + span * .64, base - h * .81], [x + span * .66, base - h * .43], [x + span * .92, base - h * .14], [x + span + 49, base]]);
        withAlpha(.14, () => shape(g, p.moon, [[x + span * .14, base - h * .25], [x + span * .3, base - h * .82], [x + span * .57, base - h], [x + span * .44, base - h * .69], [x + span * .39, base - h * .66], [x + span * .3, base - h * .26]]));
      }
    }
  }

  for (let i = -1; i < viewWidth / 90 + 2; i++) {
    const n = i + Math.floor(camera * .56 / 90);
    const x = i * 90 - mod(camera * .56, 90) + rand(n + 37) * 34;
    const y = GROUND_Y + 1;
    const h = 12 + rand(n + 19) * 42;
    if (rand(n + 15) < .44) {
      line(g, p.far, 3, [[x, y], [x + 6, y - h], [x + 18, y - h - 1]]);
      oval(g, x + 16, y - h, h * .28, h * .1, p.far, undefined, 0, -.12);
      oval(g, x + 16, y - h - 2, h * .2, h * .045, p.rim);
    } else {
      shape(g, p.far, [[x - 15, y], [x - 6, y - h * .35], [x + 8, y - h * .46], [x + 20, y]]);
    }
  }
}

/**
 * Skyline styles added for levels 4-8. Draws one parallax segment of width `span` at x
 * (base = ground line of the layer, h = segment height). Returns false for the original
 * 'ridges' style so the caller falls back to the old drawing.
 */
function drawExtraSkyline(g: G, p: LevelView, color: string, x: number, base: number, h: number, span: number, i: number): boolean {
  switch (p.skyline) {
    case 'spires': {
      // Frozen moon: clusters of thin ice spires with a pale lit edge.
      shape(g, color, [[x - 20, base], [x + span * .12, base - h * .38], [x + span * .2, base - h * .78], [x + span * .27, base - h * .34],
        [x + span * .4, base - h], [x + span * .5, base - h * .3], [x + span * .62, base - h * .66], [x + span * .74, base - h * .22], [x + span + 22, base]]);
      withAlpha(.22, () => {
        shape(g, p.moon, [[x + span * .2, base - h * .78], [x + span * .27, base - h * .34], [x + span * .23, base - h * .34]]);
        shape(g, p.moon, [[x + span * .4, base - h], [x + span * .5, base - h * .3], [x + span * .44, base - h * .3]]);
      });
      return true;
    }
    case 'neon': {
      // Neon city: stepped skyscrapers with lit window rows and antenna beacons.
      const w1 = span * .36, w2 = span * .3;
      rect(g, color, x - 2, base - h, w1, h);
      rect(g, color, x + w1 + 6, base - h * .68, w2, h * .68);
      rect(g, color, x + w1 + w2 + 12, base - h * .45, span - w1 - w2 - 10, h * .45);
      line(g, color, 2, [[x + w1 * .5, base - h], [x + w1 * .5, base - h - 16]]);
      withAlpha(.5 + .3 * rand(i + 3), () => rect(g, p.glow, x + w1 * .5 - 2, base - h - 19, 4, 4));
      withAlpha(.3, () => {
        for (let row = 0; row < 8; row++) {
          const wy = base - h + 10 + row * 13;
          if (wy > base - 8) break;
          for (let col = 0; col < 3; col++) if (rand(i * 31 + row * 7 + col) > .35) rect(g, row % 3 ? p.rim : p.glow, x + 6 + col * (w1 - 12) / 3, wy, 5, 3);
        }
      });
      return true;
    }
    case 'swamp': {
      // Toxic swamp: low rounded mounds and leaning dead trees.
      const pts: Pt[] = [[x - 30, base]];
      for (let k = 0; k <= 8; k++) pts.push([x - 30 + (span + 60) * k / 8, base - h * .42 * (.55 + .45 * Math.sin(k * 1.1 + i))]);
      pts.push([x + span + 30, base]);
      shape(g, color, pts);
      const tx = x + span * (.3 + rand(i + 5) * .4), top = base - h * .42 - h * .55;
      line(g, color, 5, [[tx, base - h * .3], [tx + 6, top + h * .2], [tx + 2, top]]);
      line(g, color, 3, [[tx + 5, top + h * .3], [tx + 24, top + h * .12]]);
      line(g, color, 3, [[tx + 3, top + h * .18], [tx - 16, top + h * .02]]);
      withAlpha(.16, () => oval(g, x + span * .5, base - 4, span * .4, 4, p.glow));
      return true;
    }
    case 'islands': {
      // Sky islands: floating rocks over a cloud bank.
      const top = base - h - 14 - rand(i + 8) * 30, iw = span * (.4 + rand(i + 2) * .25), ix = x + span * .2;
      shape(g, color, [[ix, top], [ix + iw, top], [ix + iw * .82, top + h * .22], [ix + iw * .56, top + h * .5], [ix + iw * .36, top + h * .3], [ix + iw * .14, top + h * .16]]);
      withAlpha(.3, () => rect(g, p.rim, ix + 3, top - 2, iw - 6, 3));
      withAlpha(.2, () => line(g, p.moon, 2, [[ix + iw * .7, top + h * .1], [ix + iw * .7, top + h * .55]]));
      const cloud: Pt[] = [[x - 30, base]];
      for (let k = 0; k <= 6; k++) cloud.push([x - 30 + (span + 60) * k / 6, base - 14 - 10 * Math.abs(Math.sin(k * 1.7 + i))]);
      cloud.push([x + span + 30, base]);
      shape(g, color, cloud);
      return true;
    }
    case 'lair': {
      // Boss lair: jagged crags with glowing fault lines.
      shape(g, color, [[x - 30, base], [x + span * .1, base - h * .5], [x + span * .18, base - h * .44], [x + span * .3, base - h],
        [x + span * .38, base - h * .62], [x + span * .5, base - h * .8], [x + span * .64, base - h * .3], [x + span * .8, base - h * .55], [x + span + 30, base]]);
      withAlpha(.35, () => line(g, p.glow, 2, [[x + span * .3, base - h * .9], [x + span * .34, base - h * .6], [x + span * .29, base - h * .35], [x + span * .35, base - h * .1]]));
      return true;
    }
    default:
      return false;
  }
}
