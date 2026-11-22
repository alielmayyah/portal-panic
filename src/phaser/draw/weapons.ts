// Weapon visuals: shop weapons' projectiles, Prism Lance beams, Nova charge glow and dropped coins.
// Reads the state core/weapons.ts keeps per World (weaponsView); world units, drawn on the world layer.
import { WEAPONS, chargeLevel, currentWeapon, weaponsView, type Beam, type CoinDrop, type WeaponShot } from '../../core/weapons';
import type { Runner } from '../../core/types';
import { type G, TAU, glowOval, line, oval, rect, shape, withAlpha } from './prims';
import type { Visible } from './terrain';
import type { RunnerView, WorldView } from './view';

/** Draws every weapon effect of `w`. `t` is the animation clock (0 under reduced motion). */
export function drawWeapons(g: G, w: WorldView, t: number, visible: Visible): void {
  const view = weaponsView(w);
  for (const drop of view.drops) if (visible(drop.x)) drawCoin(g, drop, t);
  for (const beam of view.beams) drawBeam(g, beam, t);
  for (const shot of view.shots) if (visible(shot.x)) drawShot(g, shot, t);
  for (const r of w.runners) if (r.alive) drawCharge(g, r, t);
}

export function drawShot(g: G, shot: WeaponShot, t: number): void {
  const def = WEAPONS[shot.weapon];
  const { x, y, size } = shot;
  switch (def.kind) {
    case 'spread': {
      const a = Math.atan2(shot.vy, shot.vx);
      const tail: [number, number] = [x - Math.cos(a) * 12, y - Math.sin(a) * 12];
      line(g, def.color, 3, [tail, [x, y]], true);
      glowOval(g, x, y, size, size, def.color, 5, .3, 3);
      oval(g, x, y, size * .6, size * .6, def.glow);
      break;
    }
    case 'bounce': {
      glowOval(g, x, y, size, size, def.color, 9, .35, 4);
      oval(g, x, y, size, size, def.color, def.glow, 2);
      const spin = t * .3;
      line(g, def.glow, 1.6, [[x + Math.cos(spin) * size * .6, y + Math.sin(spin) * size * .6], [x - Math.cos(spin) * size * .6, y - Math.sin(spin) * size * .6]]);
      break;
    }
    case 'homing': {
      const a = Math.atan2(shot.vy, shot.vx);
      g.save();
      g.translateCanvas(x, y);
      g.rotateCanvas(a);
      glowOval(g, 0, 0, 9, 4, def.color, 5, .3, 3);
      shape(g, def.color, [[8, 0], [-5, -4], [-2, 0], [-5, 4]], def.glow, 1.2);
      // Wing buzz.
      const buzz = Math.sin(t * 1.7 + shot.life) * 2;
      line(g, def.glow, 1, [[-1, -3], [-4, -6 - buzz]]);
      line(g, def.glow, 1, [[-1, 3], [-4, 6 + buzz]]);
      g.restore();
      break;
    }
    case 'flame': {
      const age = 1 - shot.life / shot.maxLife;
      const color = age < .35 ? def.glow : age < .7 ? def.color : '#c2412a';
      withAlpha(Math.max(0, 1 - age * .9), () => {
        glowOval(g, x, y, size, size * .8, def.color, 4, .25, 2);
        oval(g, x, y, size * .8, size * .65, color);
      });
      break;
    }
    case 'charge': {
      glowOval(g, x, y, size * 1.5, size * 1.2, def.color, 10, .35, 4);
      oval(g, x, y, size, size * .85, def.color, def.glow, 2);
      oval(g, x + Math.sign(shot.vx) * size * .25, y, size * .45, size * .4, def.glow);
      if (shot.pierce) line(g, def.glow, 2, [[x - Math.sign(shot.vx) * size * 2.4, y], [x, y]]);
      break;
    }
    default:
      oval(g, x, y, size, size, def.color);
  }
}

export function drawBeam(g: G, beam: Beam, t: number): void {
  const k = beam.life / beam.max;
  const wobble = t ? Math.sin(t * 2.1) * .8 : 0;
  const left = Math.min(beam.x1, beam.x2);
  const width = Math.abs(beam.x2 - beam.x1);
  withAlpha(k, () => {
    rect(g, beam.color, left, beam.y - 6 * k - 2, width, 12 * k + 4, .22);
    rect(g, beam.color, left, beam.y - 3 * k - 1, width, 6 * k + 2, .7);
    line(g, beam.glow, 1.6 + k, [[beam.x1, beam.y + wobble], [beam.x2, beam.y - wobble]]);
    glowOval(g, beam.x2, beam.y, 7 * k + 3, 7 * k + 3, beam.color, 6, .4, 3);
  });
}

export function drawCoin(g: G, drop: CoinDrop, t: number): void {
  // Blink for the last two seconds.
  if (drop.life < 120 && Math.floor(drop.life / 6) % 2 === 0) return;
  const bob = drop.grounded && t ? Math.sin(t * .09 + drop.spin) * 2 : 0;
  const squash = t ? Math.abs(Math.cos(drop.spin)) * .8 + .2 : 1;
  const y = drop.y + bob;
  glowOval(g, drop.x, y, 9, 9, '#ffd34d', 5, .25, 3);
  oval(g, drop.x, y, 7 * squash, 7, '#ffcc33', '#8a5a12', 1.5);
  if (squash > .45) line(g, '#fff3b8', 1.5, [[drop.x, y - 3.5], [drop.x, y + 3.5]]);
}

/** Nova charge: a growing orb at the muzzle while fire is held. */
export function drawCharge(g: G, r: RunnerView, t: number): void {
  const level = chargeLevel(r as Runner);
  if (level <= 0) return;
  const def = currentWeapon(r as Runner);
  const x = r.x + (r.facing > 0 ? 44 : 0);
  const y = r.feet - (r.ducking ? 21 : 33);
  const pulse = t ? Math.sin(t * .5) * 1.2 : 0;
  const size = 3 + level * 7 + pulse;
  glowOval(g, x, y, size * 1.4, size * 1.4, def.color, 8, .3 + level * .2, 4);
  oval(g, x, y, size, size, def.color, def.glow, 1.5);
  if (level >= 1) {
    for (let i = 0; i < 4; i++) {
      const a = (t * .12) + i * TAU / 4;
      line(g, def.glow, 1.2, [[x + Math.cos(a) * (size + 3), y + Math.sin(a) * (size + 3)], [x + Math.cos(a) * (size + 8), y + Math.sin(a) * (size + 8)]]);
    }
  }
}
