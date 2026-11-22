// Plain CanvasRenderingContext2D port of drawRunner for the React pilot portraits.
// No Phaser dependency, so the menu can draw busts before the game boots.
import { GADGET_COLORS, type RunnerView } from './view';

type Ctx = CanvasRenderingContext2D;
type P = readonly [number, number];
const TAU = Math.PI * 2;
const INK = '#21162c';

function shape(c: Ctx, fill: string, points: readonly P[], stroke?: string, width = 2): void {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function oval(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, width = 2): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function line(c: Ctx, color: string, width: number, points: readonly P[]): void {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

function limb(c: Ctx, points: readonly P[], color: string, width: number): void {
  line(c, INK, width + 3, points);
  line(c, color, width, points);
}

/** The fields drawRunnerToCanvas reads; anything missing uses a standing, idle default. */
export type PortraitRunner = Pick<RunnerView, 'character'> & Partial<RunnerView>;

export interface PortraitOptions { shadow?: boolean; armed?: boolean }

export function drawRunnerToCanvas(c: Ctx, runner: PortraitRunner, { shadow = true, armed = false }: PortraitOptions = {}): void {
  const r = {
    x: 0, feet: 0, vx: 0, anim: 0, facing: 1, grounded: true, ducking: false,
    shield: false, boots: 0, blasterPose: 0, ...runner,
  };
  const x = r.x + 22;
  if (shadow && r.grounded) oval(c, x, r.feet + 3, r.ducking ? 24 : 18, 3, '#1c102e65');
  if (r.shield) oval(c, x, r.feet - (r.ducking ? 20 : 37), 29, r.ducking ? 25 : 44, '#71edf324', GADGET_COLORS.shield, 1.8);
  if (r.boots) oval(c, x, r.feet - 3, 17, 4, '#dfa0ff7a');
  c.save();
  c.translate(x, r.feet);
  c.scale(r.facing || 1, 1);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (r.ducking) { c.translate(5, 0); c.scale(1.13, .57); c.rotate(.15); }
  const morty = r.character === 'morty';
  const moving = Math.abs(r.vx) > .15;
  const stride = r.grounded ? (moving ? Math.sin(r.anim) : 0) : -.72;
  const lift = r.grounded ? (moving ? Math.cos(r.anim) : 0) : 1;
  const outfit = morty ? '#ffe15d' : '#e7f3e7';
  const pants = morty ? '#596898' : '#86674e';
  const skin = '#f7cba1';

  for (const j of [-1, 1]) {
    const fx = j * stride * 13 + j * 4;
    const fy = -2 - Math.max(0, j * lift) * 6;
    limb(c, [[j * 5, -21], [fx * .55 - 2, -12], [fx, fy]], pants, 5.7);
    limb(c, [[fx - 1, fy], [fx + 6, fy]], morty ? '#ece9df' : '#45364c', 4);
  }

  const arm = -stride * 10;
  limb(c, [[-5, -37], [arm - 13, -28], [arm - 16, -28 + stride * 5]], outfit, 5);
  if (morty) {
    shape(c, outfit, [[-10, -40], [7, -41], [13, -19], [-11, -19], [-14, -27]], INK);
  } else {
    shape(c, outfit, [[-8, -44], [8, -45], [12, -29], [12, -17], [-1, -20], [-17, -16], [-11, -33]], INK);
    shape(c, '#75c9d2', [[-3, -43], [8, -44], [8, -22], [0, -22]], INK, 1.35);
    line(c, '#879f9e', 1.4, [[-5, -39], [-8, -33], [-4, -30], [-9, -22], [-14, -22]]);
  }
  if (armed) {
    const kick = Math.max(0, (r.blasterPose - 3) * .65);
    limb(c, [[1, -34], [7, -28], [14 - kick, -31]], outfit, 5.5);
    c.save();
    c.translate(-kick, 0);
    shape(c, '#86b5c8', [[10, -38], [24, -38], [25, -34], [22, -28], [16, -28], [15, -24], [9, -25], [11, -31]], INK, 1.8);
    shape(c, '#456278', [[21, -38], [29, -36], [29, -31], [23, -29]], INK, 1.4);
    line(c, '#cfff82', 1.8, [[14, -35], [21, -35]]);
    oval(c, 11, -27, 3.3, 3.2, skin, INK, 1.15);
    if (r.blasterPose > 3) {
      const color = r.shotKind === 'missile' ? '#ffb777' : '#dfff88';
      shape(c, color, [[28, -35], [34, -38], [34, -35], [43, -34], [35, -32], [34, -29], [28, -33]]);
    }
    c.restore();
  } else {
    limb(c, [[3, -35], [6 + stride * 7, -28], [14 + stride * 8, -29 - stride * 5]], outfit, 5.5);
    oval(c, 15 + stride * 8, -29 - stride * 5, 3.5, 3.2, skin, INK, 1.35);
  }

  if (morty) {
    oval(c, 2, -50, 15.5, 14.3, '#854d34', INK);
    oval(c, 7, -48, 14, 13.4, skin, INK);
    oval(c, -5, -45, 3.8, 4.3, skin, INK, 1.4);
    line(c, '#854d34', 2.3, [[-4, -50], [-3, -55], [4, -58], [12, -58]]);
  } else {
    shape(c, '#a7e5ed', [[-10, -42], [-19, -42], [-16, -49], [-24, -53], [-16, -57], [-23, -64], [-12, -63], [-13, -72], [-5, -67], [1, -75], [4, -66], [13, -72], [13, -64], [22, -66], [17, -58], [22, -54], [10, -49]], INK);
    oval(c, 7, -51, 12.6, 14.7, skin, INK);
    oval(c, -5, -48, 3.5, 3.8, skin, INK, 1.4);
    line(c, '#8dc9d7', 3.7, [[1, -58], [6, -59], [12, -58], [18, -58]]);
  }
  oval(c, 7, -52, 5.6, 5.4, '#fffaf0', INK, 1.2);
  oval(c, 16.2, -52, 4.8, 5, '#fffaf0', INK, 1.2);
  oval(c, 9.1, -51, 1.5, 1.6, INK);
  oval(c, 18, -51, 1.25, 1.4, INK);
  line(c, INK, 1.45, [[14, -49], [18.5, -46.5], [15.5, -45.5]]);
  if (morty) {
    line(c, INK, 1.45, [[6, -42], [9, -44], [14, -43]]);
  } else {
    line(c, INK, 1.6, [[5, -42], [11, -42.7], [14.5, -41]]);
    line(c, '#78ad52', 1.5, [[13.4, -41], [13, -38.5]]);
  }
  c.restore();
}

/**
 * Draws a pilot bust into a portrait canvas exactly like main.js did: a 176x208 backing
 * store (4x the 44px CSS box), scaled by 4.36, runner at x -4 with feet at 77.
 */
export function drawPortrait(canvas: HTMLCanvasElement, character: string): void {
  canvas.width = 176;
  canvas.height = 208;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(4.36, 0, 0, 4.36, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRunnerToCanvas(ctx, { character, x: -4, feet: 77 }, { shadow: false });
}
