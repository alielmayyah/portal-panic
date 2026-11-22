import { GROUND_Y, LEVELS, PLATFORM_DEPTH } from './levels.js';

export { GROUND_Y, LEVELS };
export const W = 960;
export const H = 420;
export const STEP_MS = 1000 / 60;
export const PLAYER_COLORS = ['#97edf0', '#ffdb71'];
export const MAX_MISSILES = 5;
export const BOOTS_TICKS = 600;
export const ACTIONS = ['left', 'right', 'jump', 'duck', 'fire', 'missile'];
export const GADGETS = {
  shield: { name: 'Phase shield', color: '#70f1fa' },
  boots: { name: 'Gravity boots', color: '#e6a7ff' },
};

const RUN_SPEED = 6;
const JUMP_V = -15.7;
const GRAVITY = .84;
const JUMP_BUFFER = 8;
const BLASTER_RANGE = 320;
const MISSILE_RANGE = 540;
const START_X = 90;
const bounds = (value, min, max) => Math.max(min, Math.min(value, max));
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function createRunner({ name = 'Rick', color = PLAYER_COLORS[0], character = 'rick', x = START_X } = {}) {
  return {
    name, color, character, x, startX: x, feet: GROUND_Y, vx: 0, vy: 0, facing: 1,
    airTicks: 0, grounded: true, ducking: false, alive: true, coyote: 0, jumpBuffer: 0,
    prevJump: false, extraJump: false, input: {}, anim: 0, maxX: x, bonus: 0,
    orbs: 0, missiles: 3, blasterCooldown: 0, missileCooldown: 0, blasterPose: 0, kills: 0, walls: 0,
    shield: false, boots: 0, checkpoint: 0, respawnAt: 0, invuln: 0, lagTicks: 0,
  };
}

export class World {
  constructor({ runner, rival, level = 0 }) {
    this.runners = rival ? [runner, rival] : [runner];
    this.runner = runner;
    this.versus = Boolean(rival);
    this.tick = 0;
    this.camera = 0;
    this.events = [];
    this.loadLevel(level);
  }

  get score() { return this.scoreFor(this.runner); }
  get dimension() { return LEVELS[this.level]; }
  scoreFor(runner) { return Math.floor((runner.maxX - runner.startX) / 20) + runner.bonus; }

  loadLevel(level) {
    this.level = level;
    this.tick = 0;
    this.camera = 0;
    this.frozen = false;
    this.winner = null;
    this.entrants = [];
    this.portalPull = 0;
    this.blasts = [];
    this.projectiles = [];
    this.enemyShots = [];
    this.debris = [];
    this.particles = [];
    this.shake = this.flash = this.riftFlash = 0;
    this.platforms = this.dimension.platforms.map((deck) => ({ ...deck, baseY: deck.y, dy: 0 }));
    this.obstacles = this.dimension.hazards.map((o) => ({
      ...o, x: o.wx, baseX: o.wx, baseY: o.y, maxHp: o.hp, charge: 0, readyAt: 70, flash: 0,
    }));
    this.walls = this.obstacles.filter((obstacle) => obstacle.type === 'wall');
    this.surfaces = [...this.dimension.floors, ...this.platforms, ...this.walls];
    this.orbs = this.dimension.pickups.map((o) => ({ ...o }));
    for (const r of this.runners) {
      this.place(r, r.startX);
      r.maxX = r.startX;
      r.checkpoint = 0;
      r.shield = false;
      r.boots = 0;
      r.missiles = Math.max(3, r.missiles);
    }
    const { bonus, orbs, kills, missiles, walls } = this.runner;
    this.levelStart = { bonus, orbs, kills, missiles, walls };
  }

  nextLevel() {
    this.runner.bonus += this.score - this.runner.bonus + 100;
    this.loadLevel(this.level + 1);
  }

  place(r, x) {
    Object.assign(r, { x, feet: GROUND_Y, vx: 0, vy: 0, facing: 1, airTicks: 0, jumpBuffer: 0,
      coyote: 0, prevJump: false, ducking: false, grounded: true, alive: true, respawnAt: 0,
      blasterCooldown: 0, missileCooldown: 0, blasterPose: 0, extraJump: false, lagTicks: 0,
      invuln: 76, surface: null, blockedBy: null });
  }

  respawn(r) {
    this.place(r, r.checkpoint || r.startX);
    r.missiles = Math.max(2, r.missiles);
    this.events.push({ type: 'respawn', runner: r });
  }

  retry() {
    if (!this.runner.checkpoint) {
      this.events.length = 0;
      Object.assign(this.runner, this.levelStart);
      this.loadLevel(this.level);
      return;
    }
    this.frozen = false;
    this.projectiles.length = 0;
    this.enemyShots.length = 0;
    this.events.length = 0;
    this.respawn(this.runner);
    this.camera = Math.max(0, this.runner.x - 130);
  }

  step() {
    this.updateEffects();
    if (this.frozen) return;
    this.tick++;
    this.moveScenery();
    this.stepProjectiles();
    this.stepSentries();
    this.entrants.length = 0;
    for (const r of this.runners) {
      if (!r.alive) {
        if (this.versus && this.tick >= r.respawnAt) this.respawn(r);
        continue;
      }
      this.stepRunner(r);
      this.collide(r);
      if (!r.alive) continue;
      r.maxX = Math.max(r.maxX, r.x);
      if (!r.checkpoint && r.x + 22 >= this.dimension.checkpoint && r.feet > GROUND_Y - 80) {
        r.checkpoint = this.dimension.checkpoint;
        this.events.push({ type: 'checkpoint', runner: r });
      }
      if (Math.abs(r.x + 22 - this.dimension.exit) < 28 && r.feet > GROUND_Y - 94 && r.feet <= GROUND_Y + 1) this.entrants.push(r);
    }
    if (this.entrants.length) {
      this.winner = this.entrants.length === 1 ? this.entrants[0] : null;
      this.frozen = true;
      this.riftFlash = 1;
      this.events.push({ type: 'portal', runner: this.winner });
      return;
    }
    if (this.versus && this.runners.every((r) => r.alive)) this.keepRacersTogether();
  }

  moveScenery() {
    for (const deck of this.platforms) {
      if (!deck.travel) continue;
      const y = deck.baseY + Math.sin(this.tick * .034 + deck.phase) * deck.travel;
      deck.dy = y - deck.y;
      deck.y = y;
    }
    for (const obstacle of this.obstacles) {
      if (obstacle.broken) continue;
      if (obstacle.flash > 0) obstacle.flash--;
      if (obstacle.patrol) {
        obstacle.wx = obstacle.baseX + Math.sin(this.tick * (.046 + this.level * .008) + obstacle.phase) * obstacle.patrol;
      }
      if (obstacle.lift) {
        const y = obstacle.charge ? obstacle.aimY : obstacle.baseY + Math.sin(this.tick * .061 + obstacle.phase * 1.4) * obstacle.lift;
        obstacle.y += bounds(y - obstacle.y, -3, 3);
      }
    }
  }

  stepSentries() {
    for (const shot of this.enemyShots) {
      shot.prevX = shot.x;
      shot.x += shot.vx;
      shot.life--;
      if (this.wallInLine(shot.prevX, shot.x, shot.y)) shot.life = 0;
    }
    this.enemyShots = this.enemyShots.filter((shot) => shot.life > 0);

    for (const sentry of this.obstacles) {
      if (!sentry.volley || sentry.broken) continue;
      const x = sentry.wx + sentry.w / 2;
      const y = sentry.y + sentry.h / 2;
      if (sentry.charge > 0) {
        if (--sentry.charge === 0) {
          this.enemyShots.push({ x, prevX: x, y, vx: sentry.aim * (8.7 + this.level * .75), life: 53 });
          sentry.readyAt = this.tick + (sentry.volley === 2 ? 74 : 96);
          this.events.push({ type: 'enemy-fire' });
        }
        continue;
      }
      if (this.tick < sentry.readyAt) continue;
      let gap = 385;
      for (const runner of this.runners) {
        const target = runner.x + 22;
        const distance = Math.abs(target - x);
        if (!runner.alive || distance < 105 || distance >= gap || this.wallInLine(x, target, y)) continue;
        gap = distance;
        sentry.aim = Math.sign(target - x);
        sentry.aimY = bounds(runner.feet - 44 - sentry.h / 2, sentry.baseY - sentry.lift, sentry.baseY + sentry.lift);
      }
      if (gap < 385) {
        sentry.charge = 42 - this.level * 3;
        this.events.push({ type: 'enemy-charge' });
      }
    }
  }

  wallInLine(from, to, y) {
    const left = Math.min(from, to);
    const right = Math.max(from, to);
    return this.walls.some((wall) => !wall.broken && left < wall.wx + wall.w && right > wall.wx && y > wall.y && y < wall.y + wall.h);
  }

  keepRacersTogether() {
    const [a, b] = this.runners;
    const [back, lead] = a.x < b.x ? [a, b] : [b, a];
    lead.lagTicks = 0;
    if (lead.x - back.x < 480) { back.lagTicks = 0; return; }
    if (++back.lagTicks < 75) return;
    // Put a separated racer on safe ground behind the leader so both can see the shared track.
    const spot = lead.x - 330;
    const floor = this.dimension.floors.find((f) => f.x + f.w - 65 >= spot);
    if (!floor) return;
    this.place(back, Math.max(START_X, floor.x + 35, spot));
    this.events.push({ type: 'regroup', runner: back });
  }

  stepRunner(r) {
    const { left, right, jump, duck, fire, missile } = r.input;
    if (r.blasterCooldown) r.blasterCooldown--;
    if (r.missileCooldown) r.missileCooldown--;
    if (r.blasterPose) r.blasterPose--;
    if (r.boots) r.boots--;
    if (r.invuln) r.invuln--;
    if (r.grounded && r.surface?.travel) r.feet += r.surface.dy;
    if (r.grounded) r.coyote = 6;
    else if (r.coyote) r.coyote--;
    const jumpPressed = jump && !r.prevJump;
    r.prevJump = jump;
    if (jumpPressed) r.jumpBuffer = JUMP_BUFFER;
    else if (r.jumpBuffer) r.jumpBuffer--;
    if (r.jumpBuffer && r.coyote) this.jump(r, false);
    else if (jumpPressed && r.boots && r.extraJump) this.jump(r, true);

    const direction = Number(Boolean(right)) - Number(Boolean(left));
    if (direction) r.facing = direction;
    const speed = duck && r.grounded ? RUN_SPEED * .55 : RUN_SPEED;
    r.vx += bounds(direction * speed - r.vx, -1.7, 1.7);
    this.moveRunner(r, duck);
    r.airTicks++;
    if (!jump && r.airTicks > 6 && r.vy < -7.5) r.vy = -7.5;
    r.vy += GRAVITY + (duck && !r.grounded ? .75 : 0);
    const previousFeet = r.feet;
    r.feet += r.vy;
    const wasGrounded = r.grounded;
    const previousSurface = r.surface;
    r.grounded = false;
    r.surface = null;
    if (r.vy < 0) this.checkCeiling(r, previousFeet);
    if (r.vy >= 0) {
      let floor = null;
      for (const surface of this.surfaces) {
        if (surface.broken) continue;
        const oldY = surface === previousSurface ? surface.y : surface.y - (surface.dy ?? 0);
        if (r.x + 34 > surface.x && r.x + 10 < surface.x + surface.w &&
            previousFeet <= oldY + .5 && r.feet >= surface.y && (!floor || surface.y < floor.y)) floor = surface;
      }
      if (floor) {
        r.feet = floor.y;
        r.vy = 0;
        r.grounded = true;
        r.surface = floor;
        if (!wasGrounded && r.airTicks > 8) this.burst(r.x + 20, r.feet - 2, 5, '#c6a7ce', 1.2);
        r.airTicks = 0;
      }
    }
    r.ducking = Boolean(duck && r.grounded);
    if (r.grounded) r.anim += Math.abs(r.vx) * .07;
    if (missile && this.fireMissile(r)) return;
    if (fire) this.fireBlaster(r);
  }

  moveRunner(r, duck) {
    let x = bounds(r.x + r.vx, 12, this.dimension.width - 52);
    const top = r.feet - (duck && r.grounded ? 30 : 60);
    const rightEdge = duck && r.grounded ? 45 : 40;
    let blockingWall = null;
    for (const wall of this.walls) {
      if (wall.broken || r.feet <= wall.y || top >= wall.y + wall.h) continue;
      if (x > r.x && r.x + 22 < wall.wx && x + rightEdge >= wall.wx) {
        x = wall.wx - rightEdge;
        blockingWall = wall;
      } else if (x < r.x && r.x + 22 > wall.wx + wall.w && x + 5 <= wall.wx + wall.w) {
        x = wall.wx + wall.w - 5;
        blockingWall = wall;
      }
    }
    if (blockingWall) {
      r.vx = 0;
      if (blockingWall !== r.blockedBy) this.events.push({ type: 'wall-blocked', runner: r });
    }
    r.blockedBy = blockingWall;
    r.x = x;
  }

  checkCeiling(r, previousFeet) {
    const headHeight = r.character === 'rick' ? 72 : 62;
    let stop = -Infinity;
    for (const platform of this.platforms) {
      if (r.x + 33 <= platform.x || r.x + 9 >= platform.x + platform.w) continue;
      const underside = platform.y + PLATFORM_DEPTH;
      const headBefore = previousFeet - headHeight;
      const headAfter = r.feet - headHeight;
      // Some low ledges allow walking underneath with reduced clearance.
      const startingBelow = r.airTicks === 1 && previousFeet > underside + 26;
      if (headAfter < underside && (headBefore >= underside - .5 || startingBelow)) {
        stop = Math.max(stop, underside + headHeight);
      }
    }
    if (stop === -Infinity) return;
    r.feet = Math.min(previousFeet, stop);
    r.vy = 0;
    this.burst(r.x + 22, r.feet - headHeight, 5, '#dcc7e0', 1.1);
    this.events.push({ type: 'bump', runner: r });
  }

  jump(r, boost) {
    r.vy = JUMP_V * (boost ? .88 : 1);
    r.airTicks = r.coyote = r.jumpBuffer = 0;
    r.grounded = false;
    r.extraJump = !boost && r.boots > 0;
    this.events.push({ type: boost ? 'boost' : 'jump', runner: r });
    this.burst(r.x + 20, r.feet - 2, boost ? 12 : 5, boost ? GADGETS.boots.color : '#c6a7ce', boost ? 3 : 1.5);
  }

  fireBlaster(r) {
    if (r.blasterCooldown) return;
    r.blasterCooldown = 15;
    this.launch(r, { kind: 'pulse', speed: 20, remaining: BLASTER_RANGE, damage: 1 });
  }

  fireMissile(r) {
    if (r.missileCooldown) return false;
    if (!r.missiles) { this.events.push({ type: 'empty', runner: r }); return false; }
    r.missiles--;
    r.missileCooldown = 26;
    this.launch(r, { kind: 'missile', speed: 12, remaining: MISSILE_RANGE, damage: 3 });
    return true;
  }

  launch(r, shot) {
    const dir = r.facing;
    const wx = r.x + (dir > 0 ? 42 : 2);
    const y = r.feet - (r.ducking ? 21 : 33);
    if (shot.kind === 'missile') {
      let closest = MISSILE_RANGE;
      for (const obstacle of this.obstacles) {
        if (obstacle.broken) continue;
        const gap = (obstacle.wx + obstacle.w / 2 - wx) * dir;
        if (gap <= -10 || gap >= closest) continue;
        shot.target = obstacle;
        closest = gap;
      }
    }
    r.blasterPose = 8;
    r.shotKind = shot.kind;
    this.projectiles.push({ ...shot, wx, y, dir, runner: r });
    this.events.push({ type: shot.kind === 'pulse' ? 'pulse' : 'launch', runner: r });
  }

  stepProjectiles() {
    for (const shot of this.projectiles) {
      const oldX = shot.wx;
      if (shot.kind === 'missile') shot.speed = Math.min(27, shot.speed + 1.3);
      shot.wx += shot.speed * shot.dir;
      shot.remaining -= shot.speed;
      if (shot.target && !shot.target.broken) shot.y += bounds(shot.target.y + shot.target.h / 2 - shot.y, -11, 11);
      const left = Math.min(oldX, shot.wx) - 6;
      const right = Math.max(oldX, shot.wx) + 6;
      let hit = null;
      let closest = Infinity;
      for (const o of this.obstacles) {
        if (o.broken || left >= o.wx + o.w || right <= o.wx || shot.y < o.y - 5 || shot.y > o.y + o.h + 5) continue;
        const distance = shot.dir > 0 ? o.wx - oldX : oldX - o.wx - o.w;
        if (distance < closest) { hit = o; closest = distance; }
      }
      if (!hit) continue;
      this.hitObstacle(hit, shot);
      shot.remaining = 0;
    }
    this.projectiles = this.projectiles.filter((shot) => shot.remaining > 0);
  }

  hitObstacle(obstacle, shot) {
    obstacle.hp = (obstacle.hp ?? 1) - shot.damage;
    if (obstacle.hp <= 0) { this.breakObstacle(obstacle, shot.runner); return; }
    obstacle.flash = 9;
    const x = shot.dir > 0 ? obstacle.wx + 3 : obstacle.wx + obstacle.w - 3;
    this.burst(x, shot.y, 7, obstacle.type === 'wall' ? '#ffe18a' : '#bcfece', 3.6);
    this.events.push({ type: 'target-hit', runner: shot.runner });
  }

  breakObstacle(obstacle, runner, shield = false) {
    obstacle.broken = true;
    const wall = obstacle.type === 'wall';
    if (!shield) {
      if (wall) runner.walls++;
      else runner.kills++;
      runner.bonus += wall ? 35 : 12;
    }
    const x = obstacle.wx + obstacle.w / 2;
    const y = obstacle.y + obstacle.h / 2;
    const color = shield ? GADGETS.shield.color : wall ? '#ffd878' : '#ffb172';
    this.blasts.push({ x, y, color, life: 22 });
    this.burst(x, y, 26, color, 6);
    this.burst(x, y, 12, '#fff2b0', 4);
    if (wall) {
      for (let row = 0; row < 7; row++) {
        for (const side of [-1, 1]) {
          this.debris.push({ x: x + side * 9, y: obstacle.y + row * 34 + 12, vx: side * (1.4 + Math.random() * 3.4),
            vy: -2 - Math.random() * 5, angle: 0, spin: side * (.04 + Math.random() * .16), life: 50 - row * 2 });
        }
      }
    }
    this.shake = Math.max(this.shake, wall ? 11 : 7);
    this.events.push({ type: shield ? 'shield-hit' : wall ? 'wall-break' : 'blast', runner });
  }

  collide(r) {
    if (r.feet > H + 12) { this.kill(r, true); return; }
    const a = r.ducking ? { x: r.x + 6, y: r.feet - 30, w: 38, h: 28 } : { x: r.x + 7, y: r.feet - 58, w: 31, h: 56 };
    for (const o of this.obstacles) {
      if (o.broken || o.type === 'wall' || r.invuln || !overlaps(a, { x: o.wx + 5, y: o.y + 5, w: o.w - 10, h: o.h - 5 })) continue;
      if (r.shield) {
        r.shield = false;
        this.breakObstacle(o, r, true);
      } else { this.kill(r, false); return; }
    }
    for (const shot of this.enemyShots) {
      if (shot.life <= 0 || r.invuln) continue;
      const x = Math.min(shot.prevX, shot.x) - 5;
      if (!overlaps(a, { x, y: shot.y - 5, w: Math.abs(shot.vx) + 10, h: 10 })) continue;
      shot.life = 0;
      if (!r.shield) { this.kill(r, false, 'sentry-hit'); return; }
      r.shield = false;
      this.burst(shot.x, shot.y, 16, GADGETS.shield.color, 3.5);
      this.events.push({ type: 'shield-hit', runner: r });
    }
    for (const pickup of this.orbs) {
      if (pickup.taken || !overlaps(a, { x: pickup.wx - pickup.r, y: pickup.y - pickup.r, w: pickup.r * 2, h: pickup.r * 2 })) continue;
      pickup.taken = true;
      if (pickup.kind === 'shield') r.shield = true;
      else if (pickup.kind === 'boots') { r.boots = BOOTS_TICKS; r.extraJump = true; }
      else { r.bonus += 25; r.orbs++; r.missiles = Math.min(MAX_MISSILES, r.missiles + 1); }
      this.events.push({ type: GADGETS[pickup.kind] ? pickup.kind : 'orb', runner: r });
      this.burst(pickup.wx, pickup.y, 17, GADGETS[pickup.kind]?.color ?? '#bdff58', 3);
    }
  }

  kill(r, fell, source = 'death') {
    r.alive = false;
    r.shield = false;
    r.boots = 0;
    r.respawnAt = this.tick + 55;
    this.events.push({ type: fell ? 'fall' : source, runner: r });
    if (!fell) this.burst(r.x + 22, r.feet - 30, 32, r.color, 5);
    this.shake = 11;
    this.flash = .6;
    if (!this.versus) this.frozen = true;
  }

  burst(x, y, count, color, power) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * power + .5;
      const life = 18 + Math.random() * 22;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - .7, life, max: life, size: 1 + Math.random() * 3, color });
    }
  }

  updateEffects() {
    for (const chunk of this.debris) {
      chunk.x += chunk.vx;
      chunk.y += chunk.vy;
      chunk.vy += .28;
      chunk.angle += chunk.spin;
      chunk.life--;
    }
    if (this.debris.length) this.debris = this.debris.filter((chunk) => chunk.life > 0 && chunk.y < H + 30);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += .11;
      p.life--;
    }
    for (const blast of this.blasts) blast.life--;
    if (this.particles.length) this.particles = this.particles.filter((p) => p.life > 0);
    if (this.blasts.length) this.blasts = this.blasts.filter((blast) => blast.life > 0);
    this.shake *= .85;
    this.flash = Math.max(0, this.flash - .055);
    this.riftFlash = Math.max(0, this.riftFlash - .024);
  }
}
