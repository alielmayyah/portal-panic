import { GROUND_Y, H, PLATFORM_DEPTH, type LevelView, type SurfaceView } from './view';
import { type G, type Pt, TAU, line, oval, rand, rect, shape } from './prims';

export type Visible = (x: number, width?: number) => boolean;
const INK = '#201a2b';

function drawCliff(g: G, x: number, y: number, w: number, p: LevelView, camera: number, viewWidth: number): void {
  const end = x + w;
  const base = H + 14;
  const industrial = p.skyline === 'towers' || p.skyline === 'neon';
  shape(g, p.dirt, [[x, y], [end, y], [end, y + 13], [end - 4, y + 16], [end - 2, y + 28],
    [end - 10, y + 49], [end - 9, base], [x + 10, base], [x + 6, y + 44], [x + 8, y + 30], [x, y + 12]], INK, 3);
  const span = industrial ? 92 : 76;
  const start = Math.max(0, Math.floor((camera - 60 - x) / span));
  const last = Math.min(Math.ceil(w / span), Math.ceil((camera + viewWidth + 60 - x) / span));
  for (let i = start; i < last; i++) {
    const left = x + i * span;
    const right = Math.min(end, left + span);
    const width = right - left;
    if (width < 10) continue;
    if (industrial) {
      shape(g, p.near, [[left + 3, y + 8], [right - 3, y + 8], [right - 3, y + 32],
        [right - 18, y + 46], [left + 12, y + 46], [left + 4, y + 35]]);
      line(g, p.far, 1.5, [[left + 10, y + 32], [left + 18, y + 39], [right - 23, y + 39]]);
      for (let k = 0; k < 3 && 26 + k * 9 < width - 10; k++) {
        shape(g, p.dirt, [[left + 14 + k * 9, y + 17], [left + 21 + k * 9, y + 17], [left + 17 + k * 9, y + 25], [left + 10 + k * 9, y + 25]]);
      }
      rect(g, p.rim, right - 13, y + 14, 3, 2);
    } else {
      const seed = i + Math.round(x);
      const ledge = 11 + rand(seed + 2) * 12;
      const a = left + width * .26, b = left + width * .68;
      shape(g, p.far, [[left, y + 3], [right, y + 3], [right - 2, y + 9], [b, y + ledge],
        [a + 3, y + ledge + 4], [a - 1, y + ledge], [left + 1, y + 12]]);
      shape(g, p.near, [[left + 2, y + 15], [a, y + ledge + 3], [a + 5, y + ledge + 8],
        [b, y + ledge + 3], [b - 7, y + ledge + 15], [a - 3, y + ledge + 19], [left + 6, y + ledge + 11]]);
      line(g, p.rim + '6b', 1.4, [[a + 5, y + ledge + 1], [b - 3, y + ledge - 3]]);
      line(g, p.far, 1.4, [[a + 1, y + ledge + 19], [a + 10, y + ledge + 21],
        [a + 4, y + ledge + 31], [a + 6, y + ledge + 38]]);
      for (let k = 0; k < 3; k++) {
        const chipX = left + 9 + rand(seed * 6 + k) * (width - 19);
        const chipY = y + 43 + rand(seed * 9 + k) * 29;
        line(g, p.far, 1.4, [[chipX, chipY], [chipX + 3 + k, chipY - 1.5]]);
      }
    }
  }
  rect(g, p.far, x + 1, y + 1, w - 2, 4);
  line(g, p.rim, 2.7, [[x, y], [end, y]]);
}

function drawLedge(g: G, surface: SurfaceView, p: LevelView): void {
  const { x, y, w, travel, baseY } = surface;
  const end = x + w;
  const bottom = y + PLATFORM_DEPTH;
  if (travel) {
    const by = baseY ?? y;
    for (const rail of [x + 14, end - 14]) {
      line(g, '#25333e96', 4, [[rail, by - travel], [rail, by + travel + 8]]);
      line(g, '#c4ebdb99', 1, [[rail, by - travel], [rail, by + travel + 8]]);
      for (const cap of [by - travel, by + travel + 8]) oval(g, rail, cap, 3, 2.3, '#bde3d3', INK, 1.5);
    }
  }
  const metal = travel || p.skyline === 'towers' || p.skyline === 'neon';
  if (metal) {
    shape(g, '#354550', [[x, y], [end, y], [end, y + 7], [end - 8, bottom], [x + 9, bottom], [x, y + 9]], INK, 2.4);
    rect(g, '#97afa9', x + 2, y + 2, w - 4, 4);
    line(g, '#202a36', 2, [[x + 8, y + 8], [end - 7, y + 8]]);
    for (let vent = x + 17; vent < end - 13; vent += 15) {
      line(g, '#172832', 3, [[vent, y + 10], [vent - 4, y + 14]]);
    }
    line(g, travel ? '#a2fff0' : p.rim, 3, [[x, y], [end, y]]);
    for (const light of [x + 7, end - 15]) rect(g, travel ? '#90fae1' : p.moon, light, y + 8, 8, 2);
    return;
  }

  const shelf: Pt[] = [[x, y], [end, y], [end - 1, y + 7]];
  for (let s = 0; s <= 8; s++) {
    const t = s / 8;
    const depth = 6 + (1 - Math.abs(t * 2 - 1)) * 9 + rand(x + s) * 6;
    shelf.push([end - 5 - (w - 10) * t, y + depth]);
  }
  shelf.push([x, y + 5]);
  shape(g, p.near, shelf, INK, 2);
  shape(g, p.far, [[x + 1, y + 1], [end - 1, y + 1], [end - 3, y + 5], [end - w * .34, y + 9],
    [end - w * .39, y + 7], [x + w * .37, y + 11], [x + 8, y + 7]]);
  for (let cut = x + 14; cut < end - 12; cut += 27) {
    line(g, p.dirt, 1.5, [[cut + 5, y + 7], [cut, y + 12], [cut + 2, y + 14]]);
  }
  line(g, p.rim, 2.8, [[x, y], [end, y]]);
}

export function drawGround(g: G, camera: number, surfaces: readonly SurfaceView[], p: LevelView, viewWidth: number, visible: Visible): void {
  for (const surface of surfaces) {
    if (surface.type === 'wall' || !visible(surface.x, surface.w)) continue;
    if (surface.y === GROUND_Y) drawCliff(g, surface.x, surface.y, surface.w, p, camera, viewWidth);
    else drawLedge(g, surface, p);
  }
}

export function drawCheckpoint(g: G, x: number, active: boolean): void {
  const lamp = active ? '#a6ffe0' : '#f5cbc1';
  g.save();
  g.translateCanvas(x, GROUND_Y);
  shape(g, '#394453', [[-8, -1], [-5, -7], [1, -9], [7, -5], [9, -1]], INK, 2);
  line(g, INK, 5, [[0, -6], [0, -66]]);
  line(g, '#b6bfc5', 2, [[-1, -9], [-1, -65]]);
  shape(g, active ? '#47ad9e' : '#975e83', [[1, -62], [11, -64], [21, -61], [32, -62], [26, -54],
    [32, -48], [22, -46], [12, -49], [1, -46]], INK, 2);
  shape(g, lamp, [[6, -53], [12, -60], [17, -56], [12, -51], [10, -53], [8, -50]]);
  line(g, INK, 1, [[20, -58], [25, -57]]);
  oval(g, 0, -67, 3.5, 3.5, lamp, INK, 1.5);
  g.restore();
}

const PORTAL_EDGE: Pt[] = Array.from({ length: 88 }, (_, i) => {
  const a = i / 88 * TAU;
  const r = 1 + Math.sin(a * 7 + .3) * .023 + Math.sin(a * 13 - .7) * .019;
  return [Math.cos(a) * r * 46, Math.sin(a) * r * 95];
});

/** Tapered ribbons share a vanishing point so the portal reads as a turning tunnel. */
function spiralRibbon(g: G, phase: number, fill: string, radius: number, turns: number, width: number): void {
  const outer: Pt[] = [], inner: Pt[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const a = phase + t * TAU * turns;
    const r = radius * (1 - t * .82);
    const taper = width * Math.sin(t * Math.PI) * (1 - t * .65);
    const cx = -4 * t, cy = 2 * t;
    const ca = Math.cos(a), sa = Math.sin(a);
    outer.push([cx + ca * (r + taper) * .47, cy + sa * (r + taper)]);
    inner.push([cx + ca * (r - taper) * .47, cy + sa * (r - taper)]);
  }
  shape(g, fill, [...outer, ...inner.reverse()]);
}

export function drawPortal(g: G, x: number, y: number, tick: number, scale = 1): void {
  g.save();
  g.translateCanvas(x, y);
  g.scaleCanvas(scale, scale);
  g.rotateCanvas(.13);
  oval(g, 0, 0, 57, 106, '#92ff5526');
  oval(g, 0, 0, 51, 101, '#a7ff704a');
  shape(g, '#6ca947', PORTAL_EDGE, '#d3ff91', 3);
  oval(g, -1, 0, 42, 89, '#215c45');
  oval(g, -2, 1, 25, 58, '#123d37');
  oval(g, -4, 2, 10, 26, '#142d31');
  const phase = tick * .014;
  for (let i = 0; i < 3; i++) {
    const a = phase + i * TAU / 3;
    spiralRibbon(g, a, '#75d44c', 88, .67, 9);
    spiralRibbon(g, a + .08, '#c4f76b', 86, .36, 3.4);
    spiralRibbon(g, a + .9, '#399969', 56, .54, 5);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39 + phase * .42;
    const distance = 1.07 + rand(i + 24) * .21;
    const size = 1 + rand(i + 18) * 2.1;
    oval(g, Math.cos(a) * 47 * distance, Math.sin(a) * 94 * distance, size, size * 1.6, i % 3 ? '#b6ff62' : '#edffc3', undefined, 0, a);
  }
  g.restore();
}
