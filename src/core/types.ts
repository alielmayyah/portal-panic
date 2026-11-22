// Shared types for the Portal Panic core. Frozen after phase 1: other modules code against these.

export type Character = 'rick' | 'morty';
export type Mode = 'solo' | 'versus';
export type Action = 'left' | 'right' | 'jump' | 'duck' | 'fire' | 'missile' | 'swap';
export type RunnerInput = Partial<Record<Action, boolean>>;
export type Facing = 1 | -1;
export type Point = readonly [x: number, y: number];

// ---------- Level data ----------

export interface Floor { x: number; w: number; y: number }

export interface LedgeDef { x: number; w: number; y: number; travel: number; phase: number }

/** Wave 2 monsters and bosses (src/core/enemies.ts). Build them with makeMonster(). */
export type MonsterType = 'hopper' | 'swooper' | 'spitter' | 'brute' | 'splitter' | 'boss';
export type HazardType = 'wall' | 'drone' | 'slime' | 'crystal' | MonsterType;
export type GadgetKind = 'shield' | 'boots';
/** Superpowers (src/core/powers.ts). */
export type PowerKind = 'turbo' | 'magnet' | 'freeze' | 'ghost' | 'rapid' | 'giant';
export type PickupKind = 'cell' | GadgetKind | PowerKind;

/** A hazard as defined in level data. Fields that only some hazard types use are optional. */
export interface HazardDef {
  type: HazardType;
  wx: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  /** drone, slime: animation phase. */
  phase?: number;
  /** drone, slime: horizontal patrol amplitude (0 = static). */
  patrol?: number;
  /** drone: vertical bob amplitude. */
  lift?: number;
  /** drone: 0 = harmless, 1 = sentry, 2 = fast sentry. */
  volley?: number;
  /** crystal: 1 or 2 spikes. */
  shards?: number;
  /** crystal: colour tint selector (> .55 = pink). */
  tint?: number;
  /** Monsters (enemies.ts): leash half-width around the spawn x, and a per-type variant (boss: 0 mid, 1 final). */
  range?: number;
  variant?: number;
}

export interface PickupDef { wx: number; y: number; kind: PickupKind; phase: number; r: number }

export type Skyline = 'ridges' | 'towers' | 'spires' | 'neon' | 'swamp' | 'islands' | 'lair';

export interface LevelDef {
  code: string;
  name: string;
  short: string;
  width: number;
  checkpoint: number;
  exit: number;
  sky: string;
  haze: string;
  far: string;
  near: string;
  dirt: string;
  rim: string;
  moon: string;
  skyline: Skyline;
  glow: string;
  /** Bass line as MIDI note numbers. */
  bass: number[];
  /** Seconds per beat. */
  beat: number;
  floors: Floor[];
  platforms: LedgeDef[];
  hazards: HazardDef[];
  pickups: PickupDef[];
}

// ---------- Simulation state ----------

/** A moving or static ledge at runtime. */
export interface Platform extends LedgeDef { baseY: number; dy: number }

/** A hazard at runtime. */
export interface Obstacle extends HazardDef {
  /** Static x (old builds kept a copy here). */
  x: number;
  baseX: number;
  baseY: number;
  maxHp: number;
  /** Drone: ticks left until it fires (0 = idle). */
  charge: number;
  /** Drone: tick at which it may charge again. */
  readyAt: number;
  /** Ticks of hit flash. */
  flash: number;
  broken?: boolean;
  /** Drone: firing direction. */
  aim?: number;
  /** Drone: target height while charging. */
  aimY?: number;
  /** Monsters and bosses (enemies.ts): AI state. Unset for walls, drones, slimes and crystals. */
  mob?: import('./enemies').MobState;
}

/** Anything a runner can stand on. */
export type Surface = Floor | Platform | Obstacle;

export interface Pickup extends PickupDef { taken?: boolean }

export interface Runner {
  name: string;
  color: string;
  character: Character;
  x: number;
  startX: number;
  /** y of the runner's feet (y grows downward). */
  feet: number;
  vx: number;
  vy: number;
  facing: Facing;
  airTicks: number;
  grounded: boolean;
  ducking: boolean;
  /** Ticks left in a duck slide (0 = not sliding). */
  sliding: number;
  /** |vx| at the moment the slide started. */
  slideSpeed: number;
  alive: boolean;
  coyote: number;
  jumpBuffer: number;
  prevJump: boolean;
  extraJump: boolean;
  input: RunnerInput;
  anim: number;
  maxX: number;
  bonus: number;
  missiles: number;
  blasterCooldown: number;
  missileCooldown: number;
  blasterPose: number;
  shotKind?: ShotKind;
  kills: number;
  walls: number;
  shield: boolean;
  /** Ticks of gravity boots left. */
  boots: number;
  checkpoint: number;
  respawnAt: number;
  invuln: number;
  lagTicks: number;
  surface: Surface | null;
  blockedBy: Obstacle | null;
  /** Last x on solid ground away from pit edges (used by god mode to rescue a fall). */
  safeX: number;
  /** Cheat: hazards and shots cannot kill; pits put the runner back on safe ground. */
  god: boolean;
  /** Cheat: missiles are never spent. */
  infiniteAmmo: boolean;
  /** Missile capacity from shop upgrades (weapons.ts); world.ts MAX_MISSILES when unset. */
  maxMissiles?: number;
  /** Superpowers: ticks left per active power (src/core/powers.ts). Absent = none. */
  powers?: Partial<Record<PowerKind, number>>;
}

export interface RunnerOptions { name?: string; color?: string; character?: Character; x?: number }

export type ShotKind = 'pulse' | 'missile';

export interface Projectile {
  kind: ShotKind;
  speed: number;
  remaining: number;
  damage: number;
  wx: number;
  y: number;
  dir: Facing;
  runner: Runner;
  target?: Obstacle;
}

export interface EnemyShot {
  x: number;
  prevX: number;
  y: number;
  vx: number;
  life: number;
  /** Runners that already got a 'dodge' event for this shot. */
  dodged: Runner[];
  /** Monster shots (enemies.ts): vertical speed and gravity for arcing goo, the death cause, and the look. */
  vy?: number;
  gravity?: number;
  cause?: DeathCause;
  style?: 'goo' | 'orb';
}

export interface Debris { x: number; y: number; vx: number; vy: number; angle: number; spin: number; life: number }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
export interface Blast { x: number; y: number; color: string; life: number }

// ---------- Events ----------

export type MonsterDeathCause = `${MonsterType}-hit`;
export type DeathCause = 'crystal-hit' | 'slime-hit' | 'drone-hit' | 'sentry-hit' | 'fall' | MonsterDeathCause;

export type WorldEventType =
  | 'jump' | 'boost' | 'bump' | 'duck' | 'slide' | 'dodge' | 'drone-warning'
  | 'orb' | GadgetKind | 'launch' | 'pulse' | 'empty'
  | 'blast' | 'target-hit' | 'wall-break' | 'wall-blocked' | 'shield-hit'
  | 'enemy-charge' | 'enemy-fire'
  | 'checkpoint' | 'respawn' | 'regroup' | 'portal'
  | PowerKind | 'stomp' | 'power-end'
  | MonsterEventType
  | 'weapon-swap' | 'coin'
  | DeathCause;

/** Monster and boss events (enemies.ts). */
export type MonsterEventType =
  | 'hop' | 'swoop' | 'spit' | 'armor-block' | 'split'
  | 'boss-intro' | 'boss-phase' | 'boss-charge' | 'boss-volley' | 'boss-summon' | 'boss-hurt' | 'boss-death' | 'portal-open';

export interface WorldEvent {
  type: WorldEventType;
  /** The runner involved, or null (enemy fire; a 'portal' photo finish in versus). */
  runner: Runner | null;
  /** Optional world position for effects (dodge: the shot; duck: the feet). */
  x?: number;
  y?: number;
}

export interface WorldOptions { runner: Runner; rival?: Runner; level?: number }

export interface LevelStart { bonus: number; kills: number; missiles: number; walls: number }

// ---------- Cheats ----------

export type CheatCode = 'GODMODE' | 'AMMO' | 'INFINITEAMMO' | 'SHIELD' | 'BOOTS' | 'SKIP' | 'UNLOCKALL';

export type CheatResult =
  | { ok: true; code: CheatCode; label: string; /** UNLOCKALL: the app must unlock every level. */ unlockAll?: boolean }
  | { ok: false; reason?: string };
