// Rick and Morty silhouettes (port of drawRunner) plus the new crouch and slide poses.
// Invulnerability blink and portal-pull scaling are applied by the caller (drawWorld).
import { GADGET_COLORS, type RunnerView } from './view';
import { type G, type Pt, INK, glowOval, limb, line, oval, rand, shape, withAlpha } from './prims';

export interface RunnerDrawOptions {
  shadow?: boolean;
  armed?: boolean;
  /** Animation clock for streak jitter and the god aura pulse (0 under reduced motion). */
  t?: number;
}

/** translate(x, y) rotate(rot) scale(s) translate(-px, -py): maps pivot (px, py) to (x, y). */
interface Frame { x: number; y: number; rot: number; s: number; px: number; py: number }
interface Leg { pts: Pt[]; shoe: [Pt, Pt] }
interface Pose { torso: Frame; arm: Frame; head: Frame; hair: number }

const ID: Frame = { x: 0, y: 0, rot: 0, s: 1, px: 0, py: 0 };
const STAND: Pose = { torso: ID, arm: ID, head: ID, hair: 1 };
// Crouch: hips drop to -9, torso leans forward, head lowered and tucked so the top of
// the head sits near the ducked hitbox (feet - 30) and below drone shots (feet - 44).
const CROUCH: Pose = {
  torso: { x: 2, y: -9, rot: .6, s: .92, px: 0, py: -21 },
  arm: { x: 9.5, y: -18.4, rot: 0, s: .92, px: 1, py: -34 },
  head: { x: 14, y: -28, rot: .1, s: .9, px: 7, py: -51 },
  hair: .6,
};
// Slide: legs out in front, torso leaning back, head low.
const SLIDE: Pose = {
  torso: { x: 0, y: -10, rot: -.75, s: .92, px: 0, py: -21 },
  arm: { x: -7.5, y: -19.4, rot: 0, s: .92, px: 1, py: -34 },
  head: { x: -11, y: -31, rot: -.15, s: .9, px: 7, py: -51 },
  hair: .6,
};

function enter(g: G, f: Frame): void {
  g.save();
  if (f === ID) return;
  g.translateCanvas(f.x, f.y);
  if (f.rot) g.rotateCanvas(f.rot);
  if (f.s !== 1) g.scaleCanvas(f.s, f.s);
  g.translateCanvas(-f.px, -f.py);
}

function standLegs(stride: number, lift: number): Leg[] {
  return [-1, 1].map((j) => {
    const fx = j * stride * 13 + j * 4;
    const fy = -2 - Math.max(0, j * lift) * 6;
    return { pts: [[j * 5, -21], [fx * .55 - 2, -12], [fx, fy]], shoe: [[fx - 1, fy], [fx + 6, fy]] };
  });
}

function crouchLegs(stride: number): Leg[] {
  const s = stride * 2;
  return [
    // Back leg: knee down near the ground, shin trailing back.
    { pts: [[-2, -9], [-4 + s, -3], [-13 + s, -3]], shoe: [[-15 + s, -2.5], [-9 + s, -3.5]] },
    // Front leg: knee up and forward, foot planted under it.
    { pts: [[5, -9], [15, -12], [13 - s, -2]], shoe: [[12 - s, -2], [19 - s, -2]] },
  ];
}

function slideLegs(): Leg[] {
  return [
    { pts: [[-3, -8], [8, -13], [5, -3]], shoe: [[4, -3], [10, -3]] },
    { pts: [[3, -8], [17, -5], [29, -3]], shoe: [[28, -5], [33, -1]] },
  ];
}

/** Speed streaks behind a sliding runner, in facing space (negative x is behind). */
function slideStreaks(g: G, sliding: number, t: number): void {
  withAlpha(Math.min(1, sliding / 10) * .6, () => {
    [-6, -15, -25].forEach((y, i) => {
      const len = 14 + rand(i * 5 + Math.floor(t / 3)) * 16 + (i === 0 ? 6 : 0);
      const x0 = -22 - i * 3;
      line(g, i === 1 ? '#ffffff' : '#e6d7f0', i === 0 ? 2 : 1.4, [[x0, y], [x0 - len, y]]);
    });
  });
}

/** Little infinity sign (infinite-ammo cheat), centred at (x, y). */
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

// Both racers use the same inked silhouettes in the menu and in the game.
export function drawRunner(g: G, r: RunnerView, { shadow = true, armed = false, t = 0 }: RunnerDrawOptions = {}): void {
  const x = r.x + 22;
  const sliding = r.grounded && (r.sliding ?? 0) > 0;
  const low = r.ducking || sliding;
  const facing = r.facing || 1;

  if (shadow && r.grounded) oval(g, x, r.feet + 3, low ? 24 : 18, 3, '#1c102e65');
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
  g.scaleCanvas(facing, 1);
  if (sliding) slideStreaks(g, r.sliding ?? 0, t);

  const pose = sliding ? SLIDE : r.ducking ? CROUCH : STAND;
  const morty = r.character === 'morty';
  const moving = Math.abs(r.vx) > .15;
  const stride = r.grounded ? (moving ? Math.sin(r.anim) : 0) : -.72;
  const lift = r.grounded ? (moving ? Math.cos(r.anim) : 0) : 1;
  const outfit = morty ? '#ffe15d' : '#e7f3e7';
  const pants = morty ? '#596898' : '#86674e';
  const shoes = morty ? '#ece9df' : '#45364c';
  const skin = '#f7cba1';

  const legs = sliding ? slideLegs() : r.ducking ? crouchLegs(stride) : standLegs(stride, lift);
  for (const leg of legs) {
    limb(g, leg.pts, pants, 5.7);
    limb(g, leg.shoe, shoes, 4);
  }

  // Back arm and torso.
  enter(g, pose.torso);
  const arm = -stride * 10;
  limb(g, [[-5, -37], [arm - 13, -28], [arm - 16, -28 + stride * 5]], outfit, 5);
  if (morty) {
    shape(g, outfit, [[-10, -40], [7, -41], [13, -19], [-11, -19], [-14, -27]], INK);
  } else {
    shape(g, outfit, [[-8, -44], [8, -45], [12, -29], [12, -17], [-1, -20], [-17, -16], [-11, -33]], INK);
    shape(g, '#75c9d2', [[-3, -43], [8, -44], [8, -22], [0, -22]], INK, 1.35);
    line(g, '#879f9e', 1.4, [[-5, -39], [-8, -33], [-4, -30], [-9, -22], [-14, -22]]);
  }
  g.restore();

  // Front arm, upright so the blaster stays level in every pose.
  enter(g, pose.arm);
  if (armed) {
    const kick = Math.max(0, (r.blasterPose - 3) * .65);
    limb(g, [[1, -34], [7, -28], [14 - kick, -31]], outfit, 5.5);
    g.save();
    g.translateCanvas(-kick, 0);
    shape(g, '#86b5c8', [[10, -38], [24, -38], [25, -34], [22, -28], [16, -28], [15, -24], [9, -25], [11, -31]], INK, 1.8);
    shape(g, '#456278', [[21, -38], [29, -36], [29, -31], [23, -29]], INK, 1.4);
    line(g, '#cfff82', 1.8, [[14, -35], [21, -35]]);
    oval(g, 11, -27, 3.3, 3.2, skin, INK, 1.15);
    if (r.blasterPose > 3) {
      const color = r.shotKind === 'missile' ? '#ffb777' : '#dfff88';
      shape(g, color, [[28, -35], [34, -38], [34, -35], [43, -34], [35, -32], [34, -29], [28, -33]]);
    }
    g.restore();
  } else {
    limb(g, [[3, -35], [6 + stride * 7, -28], [14 + stride * 8, -29 - stride * 5]], outfit, 5.5);
    oval(g, 15 + stride * 8, -29 - stride * 5, 3.5, 3.2, skin, INK, 1.35);
  }
  g.restore();

  // Head.
  enter(g, pose.head);
  const hair = (draw: () => void) => {
    if (pose.hair === 1) { draw(); return; }
    g.save();
    g.translateCanvas(0, -51);
    g.scaleCanvas(1, pose.hair);
    g.translateCanvas(0, 51);
    draw();
    g.restore();
  };
  if (morty) {
    hair(() => oval(g, 2, -50, 15.5, 14.3, '#854d34', INK));
    oval(g, 7, -48, 14, 13.4, skin, INK);
    oval(g, -5, -45, 3.8, 4.3, skin, INK, 1.4);
    line(g, '#854d34', 2.3, [[-4, -50], [-3, -55], [4, -58], [12, -58]]);
  } else {
    hair(() => shape(g, '#a7e5ed', [[-10, -42], [-19, -42], [-16, -49], [-24, -53], [-16, -57], [-23, -64], [-12, -63], [-13, -72], [-5, -67], [1, -75], [4, -66], [13, -72], [13, -64], [22, -66], [17, -58], [22, -54], [10, -49]], INK));
    oval(g, 7, -51, 12.6, 14.7, skin, INK);
    oval(g, -5, -48, 3.5, 3.8, skin, INK, 1.4);
    line(g, '#8dc9d7', 3.7, [[1, -58], [6, -59], [12, -58], [18, -58]]);
  }
  oval(g, 7, -52, 5.6, 5.4, '#fffaf0', INK, 1.2);
  oval(g, 16.2, -52, 4.8, 5, '#fffaf0', INK, 1.2);
  oval(g, 9.1, -51, 1.5, 1.6, INK);
  oval(g, 18, -51, 1.25, 1.4, INK);
  line(g, INK, 1.45, [[14, -49], [18.5, -46.5], [15.5, -45.5]]);
  if (morty) {
    line(g, INK, 1.45, [[6, -42], [9, -44], [14, -43]]);
  } else {
    line(g, INK, 1.6, [[5, -42], [11, -42.7], [14.5, -41]]);
    line(g, '#78ad52', 1.5, [[13.4, -41], [13, -38.5]]);
  }
  g.restore();

  g.restore();

  if (r.infiniteAmmo) infinity(g, x, r.feet - (low ? 54 : 86));
}
