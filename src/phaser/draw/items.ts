// Pickups (energy cells, gadgets) and effects (rockets, pulses, debris, blasts,
// particles, dust puffs). World coordinates.
import { GADGET_COLORS, type BlastView, type DebrisView, type ParticleView, type PickupView, type ShotView } from './view';
import { type G, type Pt, INK, glowOval, glowShape, line, oval, rect, shape, withAlpha } from './prims';

const CELL: Pt[] = [[-6, -9], [5, -9], [7, -6], [7, 7], [4, 10], [-5, 10], [-7, 7], [-7, -6]];

export function drawCell(g: G, o: PickupView, x: number, t: number): void {
  const y = o.y + Math.sin(t * .08 + o.phase) * 3;
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(.39);
  glowShape(g, CELL, '#caff57', .5);
  shape(g, '#477e33', CELL, INK, 2);
  shape(g, '#b9f343', [[-5, -4], [-1, -2], [5, -5], [5, 7], [-5, 7]]);
  line(g, '#efffb7', 1.5, [[-3, -4], [-3, 2]]);
  oval(g, 2, 3, 1.5, 1.5, '#f4ffb7');
  for (const cap of [-9, 7]) {
    rect(g, '#637777', -6, cap, 12, 3);
    line(g, '#cbded0', 1.1, [[-4, cap], [3, cap]]);
  }
  g.restore();
}

export function drawGadget(g: G, item: PickupView, t: number): void {
  const x = item.wx, y = item.y + Math.sin(t * .09 + item.phase) * 3;
  const color = GADGET_COLORS[item.kind] ?? '#ffffff';
  glowOval(g, x, y, 14, 14, color, 9, .45);
  oval(g, x, y + 1, 15, 15, '#212635', INK, 2);
  oval(g, x, y - .5, 13.5, 13.5, '#33354c', color, 1.8);
  if (item.kind === 'shield') {
    shape(g, color, [[x - 8, y - 6], [x, y - 10], [x + 8, y - 6], [x + 7, y + 2], [x + 4, y + 6], [x, y + 9], [x - 6, y + 3]], INK, 1.3);
    shape(g, '#388eae', [[x, y - 6], [x + 5, y - 4], [x + 4, y + 2], [x, y + 5]]);
    line(g, '#e5ffff', 1.4, [[x - 5, y - 4], [x - 1, y - 6]]);
  } else {
    shape(g, color, [[x - 6, y - 8], [x + 1, y - 7], [x, y - 1], [x + 7, y + 1], [x + 8, y + 4], [x + 5, y + 6], [x - 7, y + 5]], INK, 1.3);
    line(g, '#fff1ff', 1.5, [[x - 5, y - 5], [x, y - 4]]);
    line(g, '#a58ace', 1.4, [[x - 7, y + 8], [x + 3, y + 9]]);
  }
}

export function drawRocket(g: G, s: ShotView): void {
  g.save();
  g.translateCanvas(s.wx, s.y);
  g.scaleCanvas(s.dir || 1, 1);
  shape(g, '#ff8f61', [[-8, -4], [-23, 1], [-8, 4]]);
  shape(g, '#ffea88', [[-7, -2], [-17, 0], [-7, 2]]);
  shape(g, '#dfecff', [[-10, -5], [5, -5], [13, 0], [5, 5], [-10, 5]], INK, 1.5);
  shape(g, '#f7879e', [[4, -5], [13, 0], [4, 5]]);
  oval(g, -3, 0, 3, 2, '#75dde0');
  g.restore();
}

const PULSE: Pt[] = [[-19, 0], [-6, -4], [7, -2], [11, 0], [7, 2], [-6, 4]];

/** Blaster bolt; `hostile` for drone shots (red), friendly is green. */
export function drawPulse(g: G, x: number, y: number, dir: number, hostile = false): void {
  const core = hostile ? '#ffd7c0' : '#ebffca';
  const glow = hostile ? '#ff527f' : '#adf46f';
  g.save();
  g.translateCanvas(x, y);
  g.scaleCanvas(dir || 1, 1);
  glowShape(g, PULSE, glow, .55);
  shape(g, glow, PULSE);
  line(g, core, 2, [[-7, 0], [6, 0]]);
  g.restore();
}

export function drawDebris(g: G, chunk: DebrisView): void {
  withAlpha(Math.min(1, chunk.life / 15), () => {
    g.save();
    g.translateCanvas(chunk.x, chunk.y);
    g.rotateCanvas(chunk.angle);
    shape(g, '#78576a', [[-8, -13], [8, -11], [8, 5], [2, 12], [-9, 8]], INK, 1.2);
    line(g, '#ffd183', 1.3, [[-6, -9], [5, -6], [-2, 2]]);
    g.restore();
  });
}

export function drawBlast(g: G, blast: BlastView): void {
  const progress = 1 - blast.life / 22;
  withAlpha(1 - progress, () => oval(g, blast.x, blast.y, 8 + progress * 31, 7 + progress * 27, '#fff5a265', blast.color, 3));
}

export function drawParticles(g: G, particles: readonly ParticleView[]): void {
  for (const pt of particles) rect(g, pt.color, pt.x, pt.y, pt.size, pt.size, Math.max(0, pt.life / pt.max));
}

/** A dust puff spawned on a 'duck' event. The caller ages it (age += 1 per tick) and drops it at age >= life. */
export interface DustPuff { x: number; y: number; dir: number; age: number; life: number }

export function dustPuffFor(r: { x: number; feet: number; facing: number }, life = 18): DustPuff {
  return { x: r.x + 22, y: r.feet, dir: r.facing || 1, age: 0, life };
}

export function drawDustPuff(g: G, puff: DustPuff): void {
  const p = Math.max(0, Math.min(1, puff.age / puff.life));
  withAlpha((1 - p) * .6, () => {
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      const spread = (4 + (k >> 1) * 6) * (1 + p * 1.4);
      const bx = puff.x + side * spread - puff.dir * p * 6;
      const by = puff.y - 2 - p * (5 + (k % 3) * 2);
      const r = 2.5 + p * 4.5 + (k % 3) * .8;
      oval(g, bx, by, r * 1.3, r, k % 3 ? '#cdb6c8' : '#efe0e6');
    }
  });
}
