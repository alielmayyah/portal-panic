// Hazards: crystals (new hot, spiky look), drones (with charge telegraph), walls
// (cracks and HP pips), slimes, and the generic hit flash. World coordinates.
import type { ObstacleView } from './view';
import { crystalShards } from '../../core/world';
import { type G, type Pt, INK, GREEN, dashed, glowOval, line, oval, rand, rect, shape, strokeRect, withAlpha } from './prims';

const CRYSTAL_HOT = { body: '#ff3b2f', shade: '#8f1022', edge: '#ffb39b', glow: '#ff4a2a' } as const;
const CRYSTAL_WARM = { body: '#ff6a1c', shade: '#9a2a10', edge: '#ffd58a', glow: '#ff7a2a' } as const;

/**
 * Crystal spikes. The outer outline of each shard is exactly the hitbox polygon from
 * crystalShards() in core/world.ts, so what kills you is what you see. The extra spikes
 * and facets are drawn inside that outline. `t` drives the glow pulse and tip flicker;
 * pass 0 under reduced motion.
 */
export function drawCrystal(g: G, o: ObstacleView, x: number, t: number): void {
  const shards = o.shards ?? 1;
  const b = o.w / shards;
  const pal = (o.tint ?? 0) > .55 ? CRYSTAL_HOT : CRYSTAL_WARM;
  const base = o.y + o.h;
  const pulse = t ? .5 + .5 * Math.sin(t * .11 + o.wx * .05) : .5;

  // Pulsing heat halo and a scorched glow on the ground.
  glowOval(g, x + o.w / 2, base - o.h * .42, o.w * .5 + 2 + pulse * 3, o.h * .5 + 2 + pulse * 3, pal.glow, 10 + pulse * 4, .32 + pulse * .2, 5);
  withAlpha(.45 + pulse * .25, () => oval(g, x + o.w / 2, base, o.w * .56, 3, '#ff9a4a'));

  crystalShards(o, x).forEach((poly, i) => {
    // Hull: [base-left, left shoulder, main tip, right shoulder, base-right].
    const a = poly[0][0];
    const h = base - poly[2][1];
    shape(g, pal.body, poly, INK, 2);
    // Inner secondary spikes (inside the hull) in the darker shade.
    shape(g, pal.shade, [[a + b * .08, base - 1], [a + b * .2, base - h * .5], [a + b * .4, base - 1]]);
    shape(g, pal.shade, [[a + b * .66, base - 1], [a + b * .85, base - h * .58], [a + b * .95, base - 1]]);
    // Right facet of the main spike.
    shape(g, pal.shade, [[a + b * .55, base - h + 3], [a + b * .86, base - h * .6], [a + b * .7, base - 1], [a + b * .56, base - 1]]);
    line(g, INK, 1, [[a + b * .55, base - h + 3], [a + b * .56, base - 1]]);
    line(g, pal.edge, 1.4, [[a + b * .25, base - h * .45], [a + b * .5, base - h * .9]]);
    // White-hot tips on the hull vertices that flicker.
    [poly[2], poly[1], poly[3]].forEach(([tx, ty], k) => {
      const on = rand(i * 7 + k * 3 + o.wx + Math.floor(t / 5)) > .4;
      const s = k ? 1.5 : 2.1;
      withAlpha(on ? 1 : .35, () => {
        if (on) withAlpha(.35, () => oval(g, tx, ty + s, s * 2.2, s * 2.2, '#fff3c4'));
        shape(g, '#ffffff', [[tx, ty + .5], [tx + s * .6, ty + s * 1.3], [tx, ty + s * 2.4], [tx - s * .6, ty + s * 1.3]]);
      });
    });
  });
}

export function drawDrone(g: G, o: ObstacleView, x: number, t: number): void {
  const y = o.y + o.h / 2;
  const cx = x + o.w / 2;
  const aim = o.aim ?? 0;
  if (o.charge) {
    dashed(g, '#ff8196ad', o.charge < 12 ? 2.5 : 1.3, cx, y, cx + aim * (190 - o.charge * 2.7), y, 7, 7);
    oval(g, cx, y, 30 + o.charge * .15, 19, '#ff58871c', '#ff8196a6', 1.7);
  }
  oval(g, cx, y + 7, 14, 7, '#b95c81', INK);
  oval(g, cx, y, 23, 8, o.volley ? '#cc6789' : '#e385a3', INK);
  oval(g, cx + 4, y - 5, 13, 9, '#9af2dc', INK);
  oval(g, cx + 7, y - 8, 4, 2, '#e4fff2');
  for (const offset of [-15, -5, 9]) oval(g, cx + offset, y + 3, 2, 1.6, o.charge ? '#fff4ad' : o.volley ? '#ffad88' : GREEN);
  if (o.volley) oval(g, cx + (aim || -1) * 20, y + Math.sin(t * .25) * .55, 4, 3, o.charge ? '#fff1b1' : '#ff9aab', INK, 1.25);
}

export function drawWall(g: G, o: ObstacleView): void {
  const x = o.wx;
  const right = x + o.w;
  const y = o.y;
  rect(g, o.flash ? '#8d674f' : '#403246', x, y, o.w, o.h);
  strokeRect(g, '#f0bb71', 2, x + 1, y + 1, o.w - 2, o.h - 1);
  for (let row = 0; row < 7; row++) {
    const yy = y + 11 + row * 34;
    shape(g, row % 2 ? '#73566a' : '#5c485d', [[x + 4, yy], [right - 4, yy], [right - 5, yy + 28], [x + 5, yy + 28]], INK, 1.2);
    oval(g, x + 8, yy + 4, 1.7, 1.7, '#ffd078');
    oval(g, right - 8, yy + 24, 1.7, 1.7, '#ffd078');
  }
  const center = x + o.w / 2;
  const damage = o.maxHp - o.hp;
  const cracks: Pt[] = [[center - 3, y + 36], [center + 6, y + 78], [center - 9, y + 127], [center + 5, y + 167], [center - 7, y + 219], [center + 3, y + o.h]];
  line(g, '#251a2f', 4, cracks);
  line(g, damage ? '#ffd185' : '#ee9c68', damage ? 1.4 + damage * .3 : 1.2, cracks);
  for (let i = 0; i < damage && i + 1 < cracks.length; i++) {
    const [cx, cy] = cracks[i + 1];
    line(g, '#ffdb92', 1.4, [[cx, cy], [cx + (i % 2 ? 13 : -12), cy + 12], [x + (i % 2 ? o.w - 3 : 4), cy + 22]]);
  }
  for (let i = 0; i < o.maxHp; i++) rect(g, i < o.hp ? '#ffd98b' : '#291b31', center - o.maxHp * 2.5 + i * 5, y + 5, 4, 3);
}

export function drawSlime(g: G, o: ObstacleView, t: number): void {
  const x = o.wx + o.w / 2;
  const y = o.y + o.h;
  const bounce = Math.sin(t * .15 + (o.phase ?? 0)) * 3;
  oval(g, x, y - 7, 24, 7, '#61518b', INK);
  oval(g, x, y - 19 + bounce, 21, 19 - bounce, '#ab6cdb', INK);
  for (const eye of [x - 7, x + 7]) {
    oval(g, eye, y - 24 + bounce, 6, 7, '#faffc8', INK, 1.4);
    oval(g, eye - 1.7, y - 24 + bounce, 2, 3.1, INK);
  }
  line(g, INK, 2, [[x - 7, y - 13], [x, y - 9], [x + 7, y - 13]]);
}

/** Brief white flash over a non-wall obstacle that was hit. */
export function drawHitFlash(g: G, o: ObstacleView): void {
  oval(g, o.wx + o.w / 2, o.y + o.h / 2, o.w * .43, o.h * .38, '#fff2a73e', '#fff2a7ac', 1.4);
}
