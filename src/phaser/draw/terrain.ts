// World layer: ground glow, floors, platforms (with moving-platform rails),
// the checkpoint flag and the exit portal. World coordinates.
import { GROUND_Y, H, PLATFORM_DEPTH, type LevelView, type SurfaceView } from './view';
import { type G, GREEN, TAU, gradientRect, line, oval, rand, rect, shape, withAlpha } from './prims';

export type Visible = (x: number, width?: number) => boolean;

export function drawGround(g: G, camera: number, surfaces: readonly SurfaceView[], p: LevelView, viewWidth: number, visible: Visible): void {
  gradientRect(g, camera - 12, GROUND_Y, viewWidth + 24, H - GROUND_Y + 12, '#361634', p.glow, 10);
  for (const { x, y, w: width, type, travel, baseY } of surfaces) {
    if (type === 'wall' || !visible(x, width)) continue;
    if (travel) {
      const by = baseY ?? y;
      for (const side of [x + 14, x + width - 14]) {
        line(g, '#c5ccd44f', 2, [[side, by - travel - 4], [side, by + travel + 9]]);
        oval(g, side, by - travel - 4, 2, 2, '#e4e1bec9');
        oval(g, side, by + travel + 9, 2, 2, '#e4e1bec9');
      }
    }
    const bottom = y === GROUND_Y ? H + 12 : y + PLATFORM_DEPTH;
    shape(g, p.dirt, [[x, y], [x + width, y], [x + width - 5, bottom], [x + 5, bottom]], p.far);
    // Marks sit at fixed world positions so they scroll with the ground and keep their pebbles.
    withAlpha(.36, () => {
      const first = x + 12 + Math.max(0, Math.ceil((camera - 16 - x - 12) / 32)) * 32;
      for (let mark = first; mark < Math.min(x + width - 8, camera + viewWidth + 16); mark += 32) {
        line(g, p.rim, 1.5, [[mark, y + 6], [mark + 10, y + 6]]);
        if (y === GROUND_Y) oval(g, mark, y + 14 + rand(mark) * 45, 3 + rand(mark + 4) * 6, 1.1, p.rim);
      }
    });
    line(g, travel ? '#9bf9e7' : p.rim, 2, [[x, y], [x + width, y]]);
    if (travel) for (const light of [x + 11, x + width - 17]) rect(g, '#9bf9e7', light, y + 8, 6, 2, .8);
  }
}

export function drawCheckpoint(g: G, x: number, active: boolean): void {
  const color = active ? '#88ffd8' : '#d9bbeb';
  line(g, '#261831', 6, [[x, GROUND_Y], [x, GROUND_Y - 64]]);
  line(g, color, 2, [[x, GROUND_Y - 7], [x, GROUND_Y - 63]]);
  shape(g, active ? '#66d9bc' : '#9468b5', [[x, GROUND_Y - 65], [x + 27, GROUND_Y - 65], [x + 20, GROUND_Y - 56], [x + 27, GROUND_Y - 49], [x, GROUND_Y - 49]], '#21162c');
  oval(g, x, GROUND_Y - 68, 4, 4, color, '#21162c', 1.5);
}

const PORTAL_RINGS = ['#5ea83e', GREEN, '#568d35', '#aee83a', '#427330', '#8bcf40', '#2a5933'];

/** Animated swirl portal centred at (x, y). `t` is the world tick (0 under reduced motion). */
export function drawPortal(g: G, x: number, y: number, t: number, scale = 1): void {
  g.save();
  g.translateCanvas(x, y);
  g.scaleCanvas(scale, scale);
  g.rotateCanvas(.18);
  // Radial halo '#87ef4d63' -> transparent, as stacked discs.
  const discs = 12;
  for (let k = 0; k < discs; k++) {
    const r = 123 - (123 - 12) * k / discs;
    withAlpha(.39 / discs, () => oval(g, 0, 0, r, r, '#87ef4d'));
  }
  for (const [i, color] of PORTAL_RINGS.entries()) {
    const steps = 62, rx = 48 - i * 5.8, ry = 100 - i * 12;
    const pts: [number, number][] = [];
    for (let j = 0; j < steps; j++) {
      const a = j / steps * TAU;
      const s = 1 + Math.sin(a * 5 - t * .035 + i * .76) * .06 + Math.cos(a * 3 + t * .028) * .065;
      pts.push([Math.cos(a) * rx * s + Math.sin(i) * 3, Math.sin(a) * ry * s]);
    }
    shape(g, color, pts);
  }
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39 + t * .012;
    const r = 1.06 + rand(i + 60) * .33;
    const size = rand(i + 90) * 2.6 + .9;
    oval(g, Math.cos(a) * 49 * r, Math.sin(a) * 92 * r, size, size, i % 3 ? GREEN : '#f1ffc1');
  }
  g.restore();
}
