// Small canvas-like helpers on top of Phaser Graphics: CSS hex colors with alpha,
// a global alpha multiplier, polygons with outline, polylines with round joints,
// tilted ellipses, arcs, dashed lines, vertical gradient bands and layered glows.
import type Phaser from 'phaser';

export type G = Phaser.GameObjects.Graphics;
export type Pt = readonly [number, number];

export const TAU = Math.PI * 2;
export const INK = '#21162c';
export const GREEN = '#caff57';
export const mod = (n: number, m: number): number => ((n % m) + m) % m;
export const rand = (n: number): number => mod(Math.sin(n * 72.319 + 4.112) * 41578.5, 1);

const colorCache = new Map<string, readonly [number, number]>();

/** Parses '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa' into [0xrrggbb, alpha]. */
export function paint(css: string): readonly [number, number] {
  const cached = colorCache.get(css);
  if (cached) return cached;
  let hex = css.trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
  const n = parseInt(hex.slice(0, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  const value = [Number.isFinite(n) ? n : 0xff00ff, Number.isFinite(a) ? a : 1] as const;
  colorCache.set(css, value);
  return value;
}

export function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

// Canvas globalAlpha equivalent. Nested calls multiply.
let alphaMul = 1;
export function withAlpha<T>(alpha: number, fn: () => T): T {
  const prev = alphaMul;
  alphaMul = prev * Math.max(0, Math.min(1, alpha));
  try { return fn(); } finally { alphaMul = prev; }
}

export function setFill(g: G, css: string, alpha = 1): void {
  const [c, a] = paint(css);
  g.fillStyle(c, a * alpha * alphaMul);
}

export function setLine(g: G, css: string, width: number, alpha = 1): void {
  const [c, a] = paint(css);
  g.lineStyle(width, c, a * alpha * alphaMul);
}

function path(g: G, pts: readonly Pt[], close: boolean): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}

/** Filled polygon with optional outline (canvas `shape` in render.js). */
export function shape(g: G, fill: string | null, pts: readonly Pt[], stroke?: string, width = 2): void {
  if (pts.length < 2) return;
  path(g, pts, true);
  if (fill) { setFill(g, fill); g.fillPath(); }
  if (stroke) { setLine(g, stroke, width); g.strokePath(); }
}

/** Polyline. `round` adds round joints and caps, like lineJoin/lineCap 'round'. */
export function line(g: G, color: string, width: number, pts: readonly Pt[], round = false): void {
  if (pts.length < 2) return;
  setLine(g, color, width);
  path(g, pts, false);
  g.strokePath();
  if (round && width > 1.5) {
    setFill(g, color);
    for (const [x, y] of pts) g.fillCircle(x, y, width / 2);
  }
}

export function rect(g: G, fill: string, x: number, y: number, w: number, h: number, alpha = 1): void {
  setFill(g, fill, alpha);
  g.fillRect(x, y, w, h);
}

export function strokeRect(g: G, color: string, width: number, x: number, y: number, w: number, h: number): void {
  setLine(g, color, width);
  g.strokeRect(x, y, w, h);
}

const segsFor = (rx: number, ry: number) => Math.max(10, Math.min(64, Math.round((Math.abs(rx) + Math.abs(ry)) * .55)));

/** Points on an ellipse (optionally tilted) from angle a0 to a1. */
export function ellipsePoints(x: number, y: number, rx: number, ry: number, tilt = 0, a0 = 0, a1 = TAU, segs = 0): Pt[] {
  const n = segs || segsFor(rx, ry);
  const full = Math.abs(a1 - a0) >= TAU - 1e-6;
  const count = full ? n : Math.max(2, Math.ceil(n * Math.abs(a1 - a0) / TAU));
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const out: Pt[] = [];
  for (let i = 0; i < (full ? count : count + 1); i++) {
    const a = a0 + (a1 - a0) * i / count;
    const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    out.push([x + ex * ct - ey * st, y + ex * st + ey * ct]);
  }
  return out;
}

/** Filled ellipse with optional outline and tilt (canvas `oval` in render.js). */
export function oval(g: G, x: number, y: number, rx: number, ry: number, fill: string | null, stroke?: string, width = 2, tilt = 0): void {
  shape(g, fill, ellipsePoints(x, y, rx, ry, tilt), stroke, width);
}

/** Stroked elliptic arc (canvas ellipse(..., start, end) + stroke). */
export function arc(g: G, color: string, width: number, x: number, y: number, rx: number, ry: number, a0: number, a1: number, tilt = 0): void {
  line(g, color, width, ellipsePoints(x, y, rx, ry, tilt, a0, a1));
}

/** Dashed straight line (canvas setLineDash). */
export function dashed(g: G, color: string, width: number, x1: number, y1: number, x2: number, y2: number, dash = 7, gap = 7): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < .5) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  setLine(g, color, width);
  g.beginPath();
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    g.moveTo(x1 + ux * d, y1 + uy * d);
    g.lineTo(x1 + ux * e, y1 + uy * e);
  }
  g.strokePath();
}

/** Vertical linear gradient as stacked bands (works on WebGL and Canvas renderers). */
export function gradientRect(g: G, x: number, y: number, w: number, h: number, top: string, bottom: string, bands = 24): void {
  if (h <= 0) return;
  const [a, aa] = paint(top);
  const [b, ba] = paint(bottom);
  const step = h / bands;
  for (let i = 0; i < bands; i++) {
    const t = (i + .5) / bands;
    g.fillStyle(lerpColor(a, b, t), (aa + (ba - aa) * t) * alphaMul);
    // Overlap bands by a hair so no seams show under fractional zoom.
    g.fillRect(x, y + i * step, w, step + .6);
  }
}

/** Soft glow: concentric ellipses whose alpha falls off outward (replaces canvas shadowBlur). */
export function glowOval(g: G, x: number, y: number, rx: number, ry: number, color: string, spread = 8, alpha = .35, layers = 4): void {
  for (let k = layers; k >= 1; k--) {
    const f = k / layers;
    withAlpha(alpha / layers * 1.6 * (1 - f * .55), () => oval(g, x, y, rx + spread * f, ry + spread * f, color));
  }
}

/** Glow for a polygon centred on the local origin: scaled copies at low alpha. */
export function glowShape(g: G, pts: readonly Pt[], color: string, alpha = .35): void {
  for (const [s, a] of [[1.75, .3], [1.4, .55]] as const) {
    withAlpha(alpha * a, () => shape(g, color, pts.map(([x, y]) => [x * s, y * s] as Pt)));
  }
}

/** Polyline limb with an ink outline (render.js `limb`). */
export function limb(g: G, pts: readonly Pt[], color: string, width: number): void {
  line(g, INK, width + 3, pts, true);
  line(g, color, width, pts, true);
}
