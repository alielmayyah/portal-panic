import { W, H, GROUND_Y, GADGETS } from './world.js';
import { LEVELS, PLATFORM_DEPTH } from './levels.js';

const TAU = Math.PI * 2;
const INK = '#21162c';
const GREEN = '#caff57';
const mod = (n, m) => ((n % m) + m) % m;
const rand = (n) => mod(Math.sin(n * 72.319 + 4.112) * 41578.5, 1);
// shadowBlur is in device pixels and ignores the transform, so glows are scaled by
// device pixels per world unit (capped to keep large blurs cheap in fullscreen).
let px = 1;

function shape(c, fill, points, stroke, width = 2) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function oval(c, x, y, rx, ry, fill, stroke, width = 2, tilt = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, tilt, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function line(c, color, width, points) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

const stars = Array.from({ length: 105 }, (_, i) => [rand(i) * W, rand(i + 110) * 268, rand(i + 220) * 1.65 + .45]);

function sky(c, w, p, viewWidth, viewTop) {
  const gradient = c.createLinearGradient(0, viewTop, 0, GROUND_Y);
  gradient.addColorStop(0, p.sky);
  gradient.addColorStop(1, p.haze);
  c.fillStyle = gradient;
  c.fillRect(-20, viewTop - 20, viewWidth + 40, H - viewTop + 40);

  for (const [x, y, s] of stars) {
    c.globalAlpha = s * .3;
    c.fillStyle = '#ffe1bd';
    const starY = viewTop + y / 268 * (268 - viewTop);
    for (let sx = mod(x - w.camera * .018, W); sx < viewWidth; sx += W) c.fillRect(sx, starY, s, s);
  }
  c.globalAlpha = 1;

  // The ringed planet and its bands move more slowly than the cliffs.
  const x = viewWidth - 123 - mod(w.camera * .025, 100);
  const y = 126;
  c.save();
  c.translate(x, y);
  c.rotate(-.29);
  c.strokeStyle = '#ffe1b5';
  c.globalAlpha = .45;
  c.lineWidth = 2;
  for (const i of [0, 1, 2]) {
    c.beginPath(); c.ellipse(0, 0, 123 + i * 7, 24 + i * 4, 0, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
  const g = c.createLinearGradient(0, -62, 0, 62);
  g.addColorStop(0, p.moon);
  g.addColorStop(1, p.haze);
  oval(c, 0, 0, 61, 61, g);
  c.save();
  c.clip();
  for (let i = 0; i < 8; i++) {
    c.globalAlpha = .1 + rand(i) * .13;
    oval(c, 8, -43 + i * 13, 100, 3 + rand(i + 9) * 3, i % 3 ? p.far : '#fff1c5');
  }
  c.restore();
  c.globalAlpha = .55;
  c.beginPath(); c.ellipse(0, 0, 128, 28, 0, .1, Math.PI - .1); c.stroke();
  c.restore();
}

function ridges(c, w, p, viewWidth) {
  const layers = [[p.far, .12, 322, 148, 172], [p.near, .32, 340, 95, 238]];
  for (const [color, speed, base, height, span] of layers) {
    const scroll = w.camera * speed;
    for (let j = -1; j < viewWidth / span + 1; j++) {
      const i = j + Math.floor(scroll / span);
      const x = j * span - mod(scroll, span);
      const h = height * (.46 + rand(i + span) * .54);
      if (p.skyline === 'towers') {
        shape(c, color, [[x - 16, base], [x - 9, base - h * .6], [x + 22, base - h * .6], [x + 22, base - h], [x + span * .42, base - h], [x + span * .42, base - h * .72], [x + span * .69, base - h * .72], [x + span * .75, base], [x + span + 30, base]]);
        c.fillStyle = p.rim;
        c.globalAlpha = .24;
        for (let k = 0; k < 6; k++) c.fillRect(x + 28 + (k % 3) * 11, base - h + 10 + Math.floor(k / 3) * 9, 6, 2);
        c.globalAlpha = 1;
      } else {
        shape(c, color, [[x - 38, base], [x - 9, base - h * .22], [x + span * .14, base - h * .25], [x + span * .3, base - h * .82], [x + span * .57, base - h], [x + span * .64, base - h * .81], [x + span * .66, base - h * .43], [x + span * .92, base - h * .14], [x + span + 49, base]]);
        c.globalAlpha = .14;
        shape(c, p.moon, [[x + span * .14, base - h * .25], [x + span * .3, base - h * .82], [x + span * .57, base - h], [x + span * .44, base - h * .69], [x + span * .39, base - h * .66], [x + span * .3, base - h * .26]]);
        c.globalAlpha = 1;
      }
    }
  }

  for (let i = -1; i < viewWidth / 90 + 2; i++) {
    const n = i + Math.floor(w.camera * .56 / 90);
    const x = i * 90 - mod(w.camera * .56, 90) + rand(n + 37) * 34;
    const y = GROUND_Y + 1;
    const h = 12 + rand(n + 19) * 42;
    if (rand(n + 15) < .44) {
      line(c, p.far, 3, [[x, y], [x + 6, y - h], [x + 18, y - h - 1]]);
      oval(c, x + 16, y - h, h * .28, h * .1, p.far, undefined, 0, -.12);
      oval(c, x + 16, y - h - 2, h * .2, h * .045, p.rim);
    } else {
      shape(c, p.far, [[x - 15, y], [x - 6, y - h * .35], [x + 8, y - h * .46], [x + 20, y]]);
    }
  }
}

function ground(c, w, p, viewWidth, visible) {
  const glow = c.createLinearGradient(0, GROUND_Y, 0, H);
  glow.addColorStop(0, '#361634'); glow.addColorStop(1, p.glow);
  c.fillStyle = glow;
  c.fillRect(w.camera - 12, GROUND_Y, viewWidth + 24, H - GROUND_Y + 12);
  for (const { x, y, w: width, type, travel, baseY } of w.surfaces) {
    if (type === 'wall' || !visible(x, width)) continue;
    if (travel) {
      for (const side of [x + 14, x + width - 14]) {
        line(c, '#c5ccd44f', 2, [[side, baseY - travel - 4], [side, baseY + travel + 9]]);
        oval(c, side, baseY - travel - 4, 2, 2, '#e4e1bec9');
        oval(c, side, baseY + travel + 9, 2, 2, '#e4e1bec9');
      }
    }
    const bottom = y === GROUND_Y ? H + 12 : y + PLATFORM_DEPTH;
    shape(c, p.dirt, [[x, y], [x + width, y], [x + width - 5, bottom], [x + 5, bottom]], p.far);
    c.globalAlpha = .36;
    // Marks sit at fixed world positions so they scroll with the ground and keep their pebbles.
    const first = x + 12 + Math.max(0, Math.ceil((w.camera - 16 - x - 12) / 32)) * 32;
    for (let mark = first; mark < Math.min(x + width - 8, w.camera + viewWidth + 16); mark += 32) {
      line(c, p.rim, 1.5, [[mark, y + 6], [mark + 10, y + 6]]);
      if (y === GROUND_Y) oval(c, mark, y + 14 + rand(mark) * 45, 3 + rand(mark + 4) * 6, 1.1, p.rim);
    }
    c.globalAlpha = 1;
    line(c, travel ? '#9bf9e7' : p.rim, 2, [[x, y], [x + width, y]]);
    if (travel) for (const light of [x + 11, x + width - 17]) c.fillRect(light, y + 8, 6, 2);
  }
}

function portal(c, x, y, t, scale = 1) {
  c.save();
  c.translate(x, y); c.scale(scale, scale); c.rotate(.18);
  const halo = c.createRadialGradient(0, 0, 10, 0, 0, 125);
  halo.addColorStop(0, '#87ef4d63'); halo.addColorStop(1, '#87ef4d00');
  oval(c, 0, 0, 123, 123, halo);
  for (const [i, color] of ['#5ea83e', GREEN, '#568d35', '#aee83a', '#427330', '#8bcf40', '#2a5933'].entries()) {
    c.beginPath();
    const steps = 62, rx = 48 - i * 5.8, ry = 100 - i * 12;
    for (let j = 0; j <= steps; j++) {
      const a = j / steps * TAU;
      const s = 1 + Math.sin(a * 5 - t * .035 + i * .76) * .06 + Math.cos(a * 3 + t * .028) * .065;
      const px = Math.cos(a) * rx * s + Math.sin(i) * 3;
      const py = Math.sin(a) * ry * s;
      if (!j) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fillStyle = color; c.fill();
  }
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39 + t * .012;
    const r = 1.06 + rand(i + 60) * .33;
    oval(c, Math.cos(a) * 49 * r, Math.sin(a) * 92 * r, rand(i + 90) * 2.6 + .9, rand(i + 90) * 2.6 + .9, i % 3 ? GREEN : '#f1ffc1');
  }
  c.restore();
}

function crystal(c, o, x) {
  const b = o.w / o.shards;
  const heights = [1, .78];
  const colors = o.tint > .55 ? ['#fb7aa6', '#a03f78', '#ffc2c8'] : ['#a683fb', '#5a4eab', '#d5c8ff'];
  for (let i = 0; i < o.shards; i++) {
    const a = x + i * b, h = o.h * heights[i], y = o.y + o.h;
    shape(c, colors[0], [[a, y], [a + b * .16, y - h * .56], [a + b * .55, y - h], [a + b * .89, y - h * .62], [a + b, y]], INK);
    shape(c, colors[1], [[a + b * .43, y - 1], [a + b * .55, y - h + 1], [a + b * .89, y - h * .62], [a + b - 1, y - 1]]);
    line(c, colors[2], 1.4, [[a + b * .22, y - h * .54], [a + b * .51, y - h * .89]]);
  }
}

function drone(c, o, x, t) {
  const y = o.y + o.h / 2;
  const cx = x + o.w / 2;
  if (o.charge) {
    c.save();
    c.setLineDash([7, 7]);
    line(c, '#ff8196ad', o.charge < 12 ? 2.5 : 1.3, [[cx, y], [cx + o.aim * (190 - o.charge * 2.7), y]]);
    c.restore();
    oval(c, cx, y, 30 + o.charge * .15, 19, '#ff58871c', '#ff8196a6', 1.7);
  }
  oval(c, cx, y + 7, 14, 7, '#b95c81', INK);
  oval(c, cx, y, 23, 8, o.volley ? '#cc6789' : '#e385a3', INK);
  oval(c, cx + 4, y - 5, 13, 9, '#9af2dc', INK);
  oval(c, cx + 7, y - 8, 4, 2, '#e4fff2');
  for (const offset of [-15, -5, 9]) oval(c, cx + offset, y + 3, 2, 1.6, o.charge ? '#fff4ad' : o.volley ? '#ffad88' : GREEN);
  if (o.volley) oval(c, cx + (o.aim || -1) * 20, y + Math.sin(t * .25) * .55, 4, 3, o.charge ? '#fff1b1' : '#ff9aab', INK, 1.25);
}

function wall(c, o) {
  const x = o.wx;
  const right = x + o.w;
  const y = o.y;
  c.fillStyle = o.flash ? '#8d674f' : '#403246';
  c.fillRect(x, y, o.w, o.h);
  c.strokeStyle = '#f0bb71';
  c.lineWidth = 2;
  c.strokeRect(x + 1, y + 1, o.w - 2, o.h - 1);
  for (let row = 0; row < 7; row++) {
    const yy = y + 11 + row * 34;
    shape(c, row % 2 ? '#73566a' : '#5c485d', [[x + 4, yy], [right - 4, yy], [right - 5, yy + 28], [x + 5, yy + 28]], INK, 1.2);
    oval(c, x + 8, yy + 4, 1.7, 1.7, '#ffd078');
    oval(c, right - 8, yy + 24, 1.7, 1.7, '#ffd078');
  }
  const center = x + o.w / 2;
  const damage = o.maxHp - o.hp;
  const cracks = [[center - 3, y + 36], [center + 6, y + 78], [center - 9, y + 127], [center + 5, y + 167], [center - 7, y + 219], [center + 3, y + o.h]];
  line(c, '#251a2f', 4, cracks);
  line(c, damage ? '#ffd185' : '#ee9c68', damage ? 1.4 + damage * .3 : 1.2, cracks);
  for (let i = 0; i < damage; i++) {
    const [cx, cy] = cracks[i + 1];
    line(c, '#ffdb92', 1.4, [[cx, cy], [cx + (i % 2 ? 13 : -12), cy + 12], [x + (i % 2 ? o.w - 3 : 4), cy + 22]]);
  }
  for (let i = 0; i < o.maxHp; i++) {
    c.fillStyle = i < o.hp ? '#ffd98b' : '#291b31';
    c.fillRect(center - o.maxHp * 2.5 + i * 5, y + 5, 4, 3);
  }
}

function cell(c, o, x, t) {
  const y = o.y + Math.sin(t * .08 + o.phase) * 3;
  c.save();
  c.translate(x, y); c.rotate(.39);
  c.shadowColor = GREEN; c.shadowBlur = 12 * px;
  shape(c, '#aaf650', [[-7, -7], [4, -10], [8, -6], [7, 7], [-4, 10], [-8, 6]], '#42652b', 1.8);
  c.shadowBlur = 0;
  shape(c, '#efffb7', [[1, -6], [-4, 1], [0, 1], [-1, 7], [5, -2], [1, -2]]);
  c.restore();
}

function slime(c, o, t) {
  const x = o.wx + o.w / 2;
  const y = o.y + o.h;
  const bounce = Math.sin(t * .15 + o.phase) * 3;
  oval(c, x, y - 7, 24, 7, '#61518b', INK);
  oval(c, x, y - 19 + bounce, 21, 19 - bounce, '#ab6cdb', INK);
  for (const eye of [x - 7, x + 7]) {
    oval(c, eye, y - 24 + bounce, 6, 7, '#faffc8', INK, 1.4);
    oval(c, eye - 1.7, y - 24 + bounce, 2, 3.1, INK);
  }
  line(c, INK, 2, [[x - 7, y - 13], [x, y - 9], [x + 7, y - 13]]);
}

function gadget(c, item, t) {
  const x = item.wx, y = item.y + Math.sin(t * .09 + item.phase) * 3;
  const color = GADGETS[item.kind].color;
  c.save();
  c.shadowColor = color; c.shadowBlur = 13 * px;
  oval(c, x, y, 14, 14, '#302440', color);
  c.shadowBlur = 0;
  if (item.kind === 'shield') {
    shape(c, color, [[x - 7, y - 6], [x, y - 10], [x + 7, y - 6], [x + 6, y + 2], [x, y + 8], [x - 6, y + 2]]);
  } else {
    line(c, color, 2.5, [[x - 6, y + 3], [x, y - 3], [x + 6, y + 3]]);
    line(c, color, 1.6, [[x - 5, y - 2], [x, y - 7], [x + 5, y - 2]]);
  }
  c.restore();
}

function rocket(c, s) {
  c.save(); c.translate(s.wx, s.y); c.scale(s.dir, 1);
  shape(c, '#ff8f61', [[-8, -4], [-23, 1], [-8, 4]]);
  shape(c, '#ffea88', [[-7, -2], [-17, 0], [-7, 2]]);
  shape(c, '#dfecff', [[-10, -5], [5, -5], [13, 0], [5, 5], [-10, 5]], INK, 1.5);
  shape(c, '#f7879e', [[4, -5], [13, 0], [4, 5]]);
  oval(c, -3, 0, 3, 2, '#75dde0');
  c.restore();
}

function pulse(c, x, y, dir, hostile = false) {
  const core = hostile ? '#ffd7c0' : '#ebffca';
  const glow = hostile ? '#ff527f' : '#adf46f';
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.shadowColor = glow;
  c.shadowBlur = 9 * px;
  shape(c, glow, [[-19, 0], [-6, -4], [7, -2], [11, 0], [7, 2], [-6, 4]]);
  c.shadowBlur = 0;
  line(c, core, 2, [[-7, 0], [6, 0]]);
  c.restore();
}

function checkpoint(c, x, active) {
  const color = active ? '#88ffd8' : '#d9bbeb';
  line(c, '#261831', 6, [[x, GROUND_Y], [x, GROUND_Y - 64]]);
  line(c, color, 2, [[x, GROUND_Y - 7], [x, GROUND_Y - 63]]);
  shape(c, active ? '#66d9bc' : '#9468b5', [[x, GROUND_Y - 65], [x + 27, GROUND_Y - 65], [x + 20, GROUND_Y - 56], [x + 27, GROUND_Y - 49], [x, GROUND_Y - 49]], INK);
  oval(c, x, GROUND_Y - 68, 4, 4, color, INK, 1.5);
}

function limb(c, points, color, width) {
  line(c, INK, width + 3, points);
  line(c, color, width, points);
}

// Both racers use the same inked silhouettes in the menu and in the game.
export function drawRunner(c, r, { shadow = true, armed = false } = {}) {
  const x = r.x + 22;
  if (shadow && r.grounded) oval(c, x, r.feet + 3, r.ducking ? 24 : 18, 3, '#1c102e65');
  if (r.shield) oval(c, x, r.feet - (r.ducking ? 20 : 37), 29, r.ducking ? 25 : 44, '#71edf324', GADGETS.shield.color, 1.8);
  if (r.boots) oval(c, x, r.feet - 3, 17, 4, '#dfa0ff7a');
  c.save();
  c.translate(x, r.feet);
  c.scale(r.facing ?? 1, 1);
  c.lineJoin = 'round'; c.lineCap = 'round';
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

export function render(ctx, w, { scale = 1, offsetY = 0, viewWidth = W, preview = false, reduceMotion = false, pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2) } = {}) {
  const t = reduceMotion ? 0 : w.tick;
  const p = w.dimension;
  const viewTop = Math.min(0, -offsetY / scale);
  // Canvas text is in world units; keep labels at least 10 CSS px tall on small screens.
  const minText = 10 * pixelRatio / scale;
  px = Math.min(scale, 3);
  ctx.setTransform(scale, 0, 0, scale, 0, offsetY);
  ctx.save();
  if (!reduceMotion && w.shake > 0) {
    // The world tick stops after a solo death, so the shake phase needs a clock that keeps running.
    const st = w.fxTick ?? performance.now() * .06;
    ctx.translate(Math.sin(st * 2.1) * w.shake * .4, Math.cos(st) * w.shake * .23);
  }
  sky(ctx, w, p, viewWidth, viewTop);
  ridges(ctx, w, p, viewWidth);
  ctx.translate(-w.camera, 0);
  const visible = (x, width = 0) => x + width > w.camera - 100 && x < w.camera + viewWidth + 100;
  const exit = preview ? 561 : p.exit;
  if (visible(exit, 50)) {
    portal(ctx, exit, 244, t, .9 + w.riftFlash * .08);
    if (!preview) {
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(13, minText)}px monospace`;
      ctx.fillStyle = '#e6ffac';
      ctx.fillText(w.level === LEVELS.length - 1 || w.versus ? 'FINISH PORTAL' : 'NEXT DIMENSION', exit, 137);
    }
  }
  ground(ctx, w, p, viewWidth, visible);
  if (!preview && visible(p.checkpoint)) checkpoint(ctx, p.checkpoint, w.runners.some((r) => r.checkpoint));
  for (const orb of w.orbs) {
    if (orb.taken || !visible(orb.wx)) continue;
    if (GADGETS[orb.kind]) gadget(ctx, orb, t);
    else cell(ctx, orb, orb.wx, t);
  }
  for (const ob of w.obstacles) {
    if (ob.broken || !visible(ob.wx, ob.w)) continue;
    if (ob.type === 'wall') wall(ctx, ob);
    else if (ob.type === 'crystal') crystal(ctx, ob, ob.wx);
    else if (ob.type === 'slime') slime(ctx, ob, t);
    else drone(ctx, ob, ob.wx, t);
    if (ob.flash && ob.type !== 'wall') oval(ctx, ob.wx + ob.w / 2, ob.y + ob.h / 2, ob.w * .43, ob.h * .38, '#fff2a73e', '#fff2a7ac', 1.4);
  }
  for (const shot of w.projectiles) {
    if (!visible(shot.wx)) continue;
    if (shot.kind === 'missile') rocket(ctx, shot);
    else pulse(ctx, shot.wx, shot.y, shot.dir);
  }
  for (const shot of w.enemyShots) if (shot.life > 0 && visible(shot.x)) pulse(ctx, shot.x, shot.y, Math.sign(shot.vx), true);
  for (const r of w.runners) {
    if (!r.alive) continue;
    if (w.portalPull && w.entrants.includes(r)) {
      const remaining = 1 - w.portalPull;
      if (remaining <= 0) continue;
      ctx.save();
      ctx.translate(p.exit, 254);
      ctx.scale(remaining, remaining);
      ctx.translate(p.exit * -1, -254);
      ctx.globalAlpha = remaining;
      drawRunner(ctx, r, { shadow: false, armed: true });
      ctx.restore();
      continue;
    }
    if (r.invuln && !reduceMotion) ctx.globalAlpha = t % 10 < 5 ? .65 : 1;
    drawRunner(ctx, r, { armed: true });
    ctx.globalAlpha = 1;
    if (w.versus && !preview) {
      const size = Math.max(11, minText);
      ctx.font = `bold ${size}px monospace`;
      const label = r.x + 22 < w.camera + 24 ? '◀ ' + r.name : r.name;
      const half = ctx.measureText(label).width / 2 + 4;
      const x = Math.max(w.camera + half, Math.min(w.camera + viewWidth - half, r.x + 22));
      // Racers start side by side; stack the second tag only while they are close together.
      const lift = w.runners.some((o) => o !== r && o.alive && Math.abs(o.x - r.x) < 60) ? w.runners.indexOf(r) * 13 : 0;
      const y = r.x < w.camera || r.x > w.camera + viewWidth ? 67 + lift : Math.max(size + 4 + lift, r.feet - 86 - lift);
      ctx.fillStyle = r.color;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y);
    }
  }
  for (const chunk of w.debris) {
    if (!visible(chunk.x)) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, chunk.life / 15);
    ctx.translate(chunk.x, chunk.y);
    ctx.rotate(chunk.angle);
    shape(ctx, '#78576a', [[-8, -13], [8, -11], [8, 5], [2, 12], [-9, 8]], INK, 1.2);
    line(ctx, '#ffd183', 1.3, [[-6, -9], [5, -6], [-2, 2]]);
    ctx.restore();
  }
  for (const blast of w.blasts) {
    const progress = 1 - blast.life / 22;
    ctx.globalAlpha = 1 - progress;
    oval(ctx, blast.x, blast.y, 8 + progress * 31, 7 + progress * 27, '#fff5a265', blast.color, 3);
  }
  for (const pt of w.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
  }
  ctx.restore();
  if (!reduceMotion && Math.max(w.riftFlash, w.flash) > 0) {
    ctx.fillStyle = w.riftFlash > 0 ? `rgba(187,255,85,${w.riftFlash * .24})` : `rgba(255,155,171,${w.flash * .16})`;
    ctx.fillRect(0, viewTop, viewWidth, H - viewTop);
  }
}
