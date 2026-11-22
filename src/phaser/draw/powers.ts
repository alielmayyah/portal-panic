// Superpower visuals: pickup orbs, runner auras, ghost blink, giant scale, freeze tint and timer rings.
// World coordinates. Reads core/powers.ts constants (pure TS, no runtime state).
import { GIANT_SCALE, POWERS, POWER_KINDS, isPowerKind, type PowerKind } from '../../core/powers';
import { type G, type Pt, INK, TAU, arc, glowOval, line, oval, rect, shape, withAlpha } from './prims';
import type { PickupView, RunnerView } from './view';

export { isPowerKind };

type PowerTimers = Readonly<Partial<Record<string, number>>>;
/** A runner that may carry power timers (core Runner.powers). */
export type PowerRunnerView = RunnerView & { readonly powers?: PowerTimers };

const ticksOf = (r: PowerRunnerView, kind: PowerKind) => r.powers?.[kind] ?? 0;
const activeOf = (r: PowerRunnerView) => POWER_KINDS.filter((k) => ticksOf(r, k) > 0);

/** Icon glyph for each power, centred on (x, y), about 16 units across. */
function glyph(g: G, kind: PowerKind, x: number, y: number, color: string): void {
  switch (kind) {
    case 'turbo': // double chevron
      line(g, color, 2.6, [[x - 7, y - 6], [x - 1, y], [x - 7, y + 6]], true);
      line(g, color, 2.6, [[x, y - 6], [x + 6, y], [x, y + 6]], true);
      return;
    case 'magnet': // horseshoe
      arc(g, color, 3.2, x, y - 1, 6, 6, 0, Math.PI);
      line(g, color, 3.2, [[x - 6, y - 1], [x - 6, y - 7]]);
      line(g, color, 3.2, [[x + 6, y - 1], [x + 6, y - 7]]);
      rect(g, '#f4f4ff', x - 7.6, y - 9, 3.2, 3);
      rect(g, '#f4f4ff', x + 4.4, y - 9, 3.2, 3);
      return;
    case 'freeze': // six-armed snowflake
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        const dx = Math.cos(a) * 8, dy = Math.sin(a) * 8;
        line(g, color, 2, [[x - dx, y - dy], [x + dx, y + dy]]);
      }
      oval(g, x, y, 2.2, 2.2, '#ffffff');
      return;
    case 'ghost': { // little ghost
      const body: Pt[] = [[x - 6, y + 7], [x - 6, y - 2], [x - 4, y - 6], [x, y - 8], [x + 4, y - 6], [x + 6, y - 2],
        [x + 6, y + 7], [x + 4, y + 4], [x + 2, y + 7], [x, y + 4], [x - 2, y + 7], [x - 4, y + 4]];
      shape(g, color, body);
      oval(g, x - 2.2, y - 2, 1.3, 1.8, INK);
      oval(g, x + 2.2, y - 2, 1.3, 1.8, INK);
      return;
    }
    case 'rapid': // three bolts
      for (const dy of [-5, 0, 5]) line(g, color, 2.2, [[x - 7, y + dy], [x + 3, y + dy]]);
      shape(g, color, [[x + 3, y - 8], [x + 8, y], [x + 3, y + 8]]);
      return;
    case 'giant': // up arrow with a base
      shape(g, color, [[x, y - 9], [x + 7, y - 1], [x + 3, y - 1], [x + 3, y + 5], [x - 3, y + 5], [x - 3, y - 1], [x - 7, y - 1]]);
      rect(g, color, x - 7, y + 6, 14, 2.4);
      return;
  }
}

/** A power pickup: glowing hexagon orb with the power's glyph and a slow spinning ring. */
export function drawPowerPickup(g: G, item: PickupView, t: number): void {
  if (!isPowerKind(item.kind)) return;
  const { color } = POWERS[item.kind];
  const x = item.wx, y = item.y + Math.sin(t * .09 + item.phase) * 3;
  glowOval(g, x, y, 16, 16, color, 10, .5);
  const hex: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + Math.PI / 6;
    hex.push([x + Math.cos(a) * 15, y + Math.sin(a) * 15]);
  }
  shape(g, '#271c38', hex, color, 2.2);
  glyph(g, item.kind, x, y, color);
  const spin = t * .05 + item.phase;
  arc(g, color, 1.6, x, y, 20, 20, spin, spin + Math.PI * .6);
  arc(g, color, 1.6, x, y, 20, 20, spin + Math.PI, spin + Math.PI * 1.6);
}

/** Alpha multiplier for a runner's sprite: ghost blinks (steady half alpha under reduced motion). */
export function powerAlpha(r: PowerRunnerView, t: number, reduceMotion = false): number {
  const ghost = ticksOf(r, 'ghost');
  if (!ghost) return 1;
  if (reduceMotion) return .5;
  // Blink faster in the last second as a warning.
  const period = ghost < 60 ? 6 : 14;
  return t % period < period / 2 ? .35 : .7;
}

/** Sprite scale around the feet (giant). */
export const powerScale = (r: PowerRunnerView): number => (ticksOf(r, 'giant') > 0 ? GIANT_SCALE : 1);

/**
 * Draws `draw` scaled around the runner's feet centre when giant. Use around drawRunner:
 *   withPowerScale(g, r, () => drawRunner(g, r, opts));
 */
export function withPowerScale(g: G, r: PowerRunnerView, draw: () => void): void {
  const s = powerScale(r);
  if (s === 1) { draw(); return; }
  const cx = r.x + 22;
  g.save();
  g.translateCanvas(cx, r.feet);
  g.scaleCanvas(s, s);
  g.translateCanvas(-cx, -r.feet);
  draw();
  g.restore();
}

/** Aura behind the runner: a soft glow per active power, plus a speed trail for turbo. */
export function drawPowerAura(g: G, r: PowerRunnerView, t: number, reduceMotion = false): void {
  const active = activeOf(r);
  if (!active.length) return;
  const s = powerScale(r);
  const cx = r.x + 22, cy = r.feet - 34 * s;
  const pulse = reduceMotion ? .5 : (Math.sin(t * .2) + 1) / 2;
  active.forEach((kind, i) => {
    const { color } = POWERS[kind];
    const rx = (28 + i * 5) * s, ry = (42 + i * 5) * s;
    glowOval(g, cx, cy, rx, ry, color, 6 + pulse * 4, .14 + pulse * .08, 3);
  });
  if (ticksOf(r, 'turbo') && !reduceMotion && Math.abs(r.vx) > 1) {
    const dir = Math.sign(r.vx);
    for (let i = 0; i < 4; i++) {
      const y = r.feet - (12 + i * 13) * s;
      const len = (18 + ((t * 3 + i * 7) % 14)) * s;
      withAlpha(.55 - i * .1, () => line(g, POWERS.turbo.color, 2, [[cx - dir * 18 * s, y], [cx - dir * (18 * s + len), y]]));
    }
  }
  if (ticksOf(r, 'magnet') && !reduceMotion) {
    const ring = 30 + ((t * 2) % 40);
    withAlpha(1 - ring / 70, () => arc(g, POWERS.magnet.color, 1.5, cx, cy, ring * s, ring * s, 0, TAU));
  }
}

/** Small countdown rings above the runner's head, one per active power (fraction of time left). */
export function drawPowerTimers(g: G, r: PowerRunnerView): void {
  const active = activeOf(r);
  if (!active.length) return;
  const s = powerScale(r);
  const top = r.feet - 80 * s - 8;
  const start = r.x + 22 - (active.length - 1) * 9;
  active.forEach((kind, i) => {
    const { color, ticks } = POWERS[kind];
    const x = start + i * 18;
    const left = Math.max(0, Math.min(1, ticksOf(r, kind) / ticks));
    oval(g, x, top, 7, 7, '#1d1529');
    arc(g, color, 2.4, x, top, 7, 7, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    oval(g, x, top, 2.2, 2.2, color);
  });
}

/** Blue-white tint over the view while time is frozen (view-relative, like drawFlash). */
export function drawFreezeTint(g: G, frozen: boolean, viewWidth: number, viewTop: number, height: number, reduceMotion = false): void {
  if (!frozen) return;
  rect(g, POWERS.freeze.color, 0, viewTop, viewWidth, height - viewTop, reduceMotion ? .08 : .12);
}

/** True while any living runner holds time freeze (mirrors core isFrozen for view data). */
export const viewFrozen = (runners: readonly PowerRunnerView[]): boolean =>
  runners.some((r) => r.alive && ticksOf(r, 'freeze') > 0);
