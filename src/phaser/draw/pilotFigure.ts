import type { Pt } from './prims';
import { INK, MORTY_SKIN, RICK_SKIN, mark, mortyHead, plate, rickHead, type PilotPen } from './pilotArt';
import type { RunnerView } from './view';

export type PilotState = Pick<RunnerView, 'character'> & Partial<RunnerView>;

function tube(p: PilotPen, a: Pt, b: Pt, c: Pt, fill: string, width: number): void {
  const path = [a, b, c];
  p.stroke(path, INK, width + 1.9);
  p.stroke(path, fill, width);
}

function leg(p: PilotPen, hip: Pt, knee: Pt, heel: Pt, morty: boolean, far: boolean, toeAngle: number): void {
  const [hx, hy] = hip, [kx, ky] = knee, [fx, fy] = heel;
  const pants = morty ? (far ? '#40516e' : '#637b9c') : (far ? '#695546' : '#9b7754');
  const hem = morty ? 2.3 : 1.8;
  // A tailored trouser leg tapers from hip to ankle, even at full extension.
  const normal = (x: number, y: number): Pt => {
    const length = Math.hypot(x, y) || 1;
    return [y / length, -x / length];
  };
  const n = normal(kx - hx, ky - hy), m = normal(fx - kx, fy - ky);
  p.plate([[hx+n[0]*3,hy+n[1]*3],[kx+n[0]*2.5,ky+n[1]*2.5],[kx+m[0]*2.5,ky+m[1]*2.5],
    [fx+m[0]*hem,fy+m[1]*hem],[fx-m[0]*hem,fy-m[1]*hem],[kx-m[0]*2.3,ky-m[1]*2.3],
    [kx-n[0]*2.3,ky-n[1]*2.3],[hx-n[0]*3,hy-n[1]*3]], pants, INK, 1.45);
  p.save();
  p.translate(fx, fy);
  p.rotate(toeAngle);
  plate(p, morty ? (far ? '#a4aeb4' : '#e9e7d5') : (far ? '#383445' : '#514454'),
    '-2.5,-1.8 1.4,-2.3 Q2.8,-.9 5.6,-.8 Q8.1,-.6 8,1.4 Q4.4,2.8 -2.8,2.2 Q-3.7,1.2 -2.5,-1.8', .95);
  mark(p, morty ? '#7b8c95' : '#887767', .65, '-2,1.3 Q2,1.7 6.7,1');
  p.restore();
}

function rickCoat(p: PilotPen, stride: number, sliding: boolean): void {
  // The rear tail has its own pivot, allowing the hem to lift on every stride.
  p.save();
  p.translate(-6, -28);
  p.rotate(sliding ? 1.1 : stride * .10);
  if (sliding) p.scale(.76, .76);
  plate(p, '#afc6c5', '1,-6 Q-5,0 -8,4 Q-12,8 -17,6 Q-16,12 -9,11 L-11,14 Q-2,14 5,5', 1.3);
  p.restore();
  plate(p, '#8ed4cb', '-6,-43 Q-1,-45 5,-44 Q11,-41 10,-34 L9,-18 Q2,-16 -6,-19', 1.35);
  plate(p, '#55464a', '-5,-22 9,-22 9,-18 -5,-18', .8);
  plate(p, '#e9b35d', '2,-21 5,-21 5,-18.5 2,-18.5', .6);
  if (sliding) {
    plate(p, '#f2efdb', '-7,-43 Q-4,-45 -1,-44 L0,-37 Q-2,-26 -4,-19 L-9,-16 -8,-20 -12,-20 Q-8,-26 -11,-32 Q-13,-39 -7,-43', 1.5);
  } else {
    plate(p, '#f2efdb', '-7,-43 Q-4,-45 -1,-44 L0,-37 Q-2,-26 -4,-17 L-11,-12 -10,-16 Q-15,-13 -19,-15 Q-11,-22 -11,-30 Q-13,-39 -7,-43', 1.5);
    plate(p, '#bfd1cb', '-9,-35 Q-6,-36 -5,-41 L-5,-33 -7,-29 -6,-27 Q-9,-18 -15,-16 Q-9,-24 -9,-35', 0);
  }
  plate(p, '#fff9e4', '-5,-43 -1,-45 0,-38 -3,-27 -5,-32 -8,-33 -5,-36 -8,-37', .9);
  plate(p, '#f1eddb', '4,-45 Q8,-46 10,-41 Q12,-32 11,-27 L14,-16 7,-17 5,-25 7,-36', 1.1);
  plate(p, '#fffae5', '4,-44 7,-44 10,-39 8,-37 10,-36 7,-32', .85);
  mark(p, '#7b9395', .8, '-8,-25 -5,-24 -6,-22 -9,-22');
  plate(p, RICK_SKIN, '-2,-49 5,-48 5,-42 Q2,-38 -.5,-41', 1);
}

function mortyShirt(p: PilotPen): void {
  plate(p, '#f6cb4d', '-8,-36 Q-5,-39 -1,-39 L5,-38 Q10,-36 11,-30 L10,-26 12,-17 Q3,-15 -8,-17 L-10,-22 -10,-29 -13,-30', 1.5);
  plate(p, '#dea844', '-7,-32 Q-5,-30 -5,-25 L-4,-20 Q2,-17 10,-19 L10,-17 Q2,-16 -7,-18 L-9,-23', 0);
  mark(p, '#b1863e', .8, '-6,-19 Q1,-17 9,-18');
  plate(p, MORTY_SKIN, '-4,-43 4,-42 6,-37 Q3,-33 -.5,-35 L-4,-38', 1.05);
  mark(p, '#8c651f', .85, '-6,-38 Q-1,-31 6,-35');
}

function portalGun(p: PilotPen, firing: number, missile: boolean): void {
  plate(p, '#789394', '-6,-1 -3,-4 8,-4.5 12,-2.8 14,-2.8 14,2.2 9,3.2 2,3 -1,8 -5,7 -3,2 -6,1', 1.2);
  plate(p, '#d9e2cd', '-5,-2 -3,-4 8,-4.5 9,-2.5 0,-1.7', .65);
  plate(p, '#a6ed66', '-1,-4.1 -1,-6.3 Q-.5,-8.8 1.7,-8.6 Q4,-8.6 4.1,-6.4 L4.4,-4.2', 1);
  mark(p, '#e8ffd6', .95, '.2,-5 .2,-6.5 1.2,-7.4');
  plate(p, '#414c61', '9,-3.4 13,-3.4 14,-2.5 14,2.2 10,2.6', .85);
  mark(p, '#b2fd7c', 1.2, '12,-1.6 12,.9');
  p.oval(-1, .5, .9, .9, '#f59d72');
  if (firing > 3) {
    plate(p, missile ? '#ffb16a' : '#abfa75', '14,-1 20,-4 19,-1.5 26,-.4 20,1 21,3.8 14,1', 0);
    mark(p, '#fffae7', 1.4, '14,0 21,-.2');
  }
}

export function drawPilot(p: PilotPen, r: PilotState, armed: boolean): void {
  const morty = r.character === 'morty';
  const moving = Math.abs(r.vx ?? 0) > .15;
  const air = r.grounded === false;
  const slide = !air && (r.sliding ?? 0) > 0;
  const low = slide || Boolean(r.ducking);
  const phase = r.anim ?? 0;
  const stride = air ? -.72 : moving ? Math.sin(phase) : 0;
  const lift = air ? 1 : moving ? Math.cos(phase) : 0;
  const bob = low || air || !moving ? 0 : -Math.abs(Math.cos(phase)) * 1.5;
  const hipY = low ? -8 : (morty ? -17 : -20) + bob;
  const skin = morty ? MORTY_SKIN : RICK_SKIN;
  for (const side of [-1, 1]) {
    const hip: Pt = [side * 2.5, hipY];
    const knee: Pt = slide ? [side < 0 ? 7 : 16, side < 0 ? -13 : -7]
      : low ? [side < 0 ? -5 : 13, side < 0 ? -4 : -11]
      : [side * 3 + stride * side * 6 + Math.max(0, side * lift) * 6, hipY * .56 - Math.max(0, side * lift) * 3];
    const heel: Pt = slide ? [side < 0 ? 4 : 24, -2.5]
      : low ? [side < 0 ? -14 : 10, -2.5]
      : [side * 4 + side * stride * 15 - Math.max(0, side * lift) * 6, -2.5 - Math.max(0, side * lift) * 8];
    leg(p, hip, knee, heel, morty, side < 0, slide ? -.14 : low ? 0 : side * stride * .27);
  }

  const tilt = slide ? -.78 : low ? .65 : air ? .08 : moving ? .12 : -.025;
  p.save();
  p.translate(low ? (slide ? -1 : 2) : 0, hipY);
  p.rotate(tilt);
  if (low) p.scale(.95, .82);
  p.translate(0, morty ? 17 : 20);

  const shoulderY = morty ? -33 : -38;
  const farElbow: Pt = [-10 - stride * 4, shoulderY + 7];
  const farHand: Pt = moving || air || low ? [-14 - stride * 6, shoulderY + 3 + stride * 4] : [-9, shoulderY + 12];
  tube(p, [-5,shoulderY], farElbow, farHand, morty ? '#e4ad87' : '#b4c7c5', morty ? 3.3 : 4.5);
  p.oval(farHand[0] - .6, farHand[1], 2.6, 2.25, morty ? '#e4ad87' : '#c5bca8', INK, 1);
  if (morty) mortyShirt(p);
  else rickCoat(p, stride, slide);

  // Keep the aiming hand steady while the runner leans and the coat swings.
  const kick = Math.max(0, ((r.blasterPose ?? 0) - 3) * .65);
  // Transform the world-space aiming point back into torso space. The muzzle stays
  // on the projectile line even for the much steeper crouch and slide angles.
  const localAim = (worldX: number, worldY: number): Pt => {
    const x = worldX - (low ? (slide ? -1 : 2) : 0);
    const y = worldY - hipY;
    return [(x * Math.cos(tilt) + y * Math.sin(tilt)) / (low ? .95 : 1),
      (-x * Math.sin(tilt) + y * Math.cos(tilt)) / (low ? .82 : 1) - (morty ? 17 : 20)];
  };
  const hand: Pt = armed ? localAim((slide ? 2 : low ? 20 : 9) - kick, low ? -16.5 : -28.5)
    : [moving ? 7 + stride * 6 : 0, shoulderY + (moving ? 9 - stride * 5 : 15)];
  const elbow: Pt = armed && low ? localAim(slide ? -9 : 7, -10)
    : armed ? [-2, shoulderY + 11] : [-7 - stride * 2, shoulderY + 9];
  tube(p, [-4, shoulderY], elbow, hand, morty ? skin : '#f4f1df', morty ? 3.6 : 4.5);
  if (morty) {
    plate(p, '#ffdb5a', '-7,-36 Q-4,-37 -2,-34 L0,-30 -7,-27 -10,-31 Q-10,-34 -7,-36', 1.2);
  } else {
    mark(p, '#8b9da1', 1, '-6,-36 Q-3,-37 -2,-34');
    mark(p, '#8b9da1', .85, '-4,-28 -1,-27');
  }
  p.save();
  p.translate(hand[0], hand[1]);
  p.rotate(-tilt);
  if (armed) {
    p.translate(2, -4.5);
    portalGun(p, r.blasterPose ?? 0, r.shotKind === 'missile');
    p.translate(-2, 4.5);
  }
  p.oval(0, 0, 2.8, 2.1, skin, INK, .95);
  mark(p, '#987e6f', .65, '.6,-.6 1.7,.3');
  p.restore();
  p.restore();

  const headX = slide ? -10 : low ? 13 : moving ? 5 : 2.5;
  const headY = slide ? -16.7 : low ? -15.8 : (morty ? -38 : -44) + bob;
  p.save();
  p.translate(headX, headY);
  p.rotate(slide ? -.20 : low ? .18 : moving ? .025 + stride * .025 : -.045);
  const size = morty ? .343 : .34;
  p.scale(low ? size * .83 : size, low ? size * .71 : size);
  if (morty) mortyHead(p);
  else rickHead(p);
  p.restore();
}
