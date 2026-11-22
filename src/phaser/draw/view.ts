// Minimal read-only views of the simulation state the drawing code needs.
// Field names match src/game/world.js and src/game/levels.js exactly, so the core
// World / level types satisfy these interfaces structurally.

export const W = 960;
export const H = 420;
export const GROUND_Y = 340;
export const PLATFORM_DEPTH = 18;
export const GADGET_COLORS: Readonly<Record<string, string>> = {
  shield: '#70f1fa',
  boots: '#e6a7ff',
};

export interface RunnerView {
  readonly name: string;
  readonly color: string;
  readonly character: string;
  readonly x: number;
  readonly feet: number;
  readonly vx: number;
  readonly facing: number;
  readonly grounded: boolean;
  readonly ducking: boolean;
  readonly alive: boolean;
  readonly anim: number;
  readonly blasterPose: number;
  readonly shotKind?: string;
  readonly shield: boolean;
  readonly boots: number;
  readonly invuln: number;
  readonly checkpoint: number;
  /** Ticks left in a duck slide (new gameplay). */
  readonly sliding?: number;
  /** Cheat flags (new gameplay). */
  readonly god?: boolean;
  readonly infiniteAmmo?: boolean;
}

export interface ObstacleView {
  readonly type: string; // 'wall' | 'crystal' | 'slime' | 'drone'
  readonly wx: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly flash: number;
  readonly charge: number;
  readonly broken?: boolean;
  readonly aim?: number;
  readonly volley?: number;
  readonly phase?: number;
  readonly shards?: number;
  readonly tint?: number;
}

export interface PickupView {
  readonly wx: number;
  readonly y: number;
  readonly kind: string; // 'cell' | 'shield' | 'boots'
  readonly phase: number;
  readonly taken?: boolean;
}

export interface SurfaceView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly type?: string;
  readonly travel?: number;
  readonly baseY?: number;
}

/** A runner projectile (world.projectiles). */
export interface ShotView {
  readonly kind: string; // 'pulse' | 'missile'
  readonly wx: number;
  readonly y: number;
  readonly dir: number;
}

/** A drone shot (world.enemyShots). */
export interface EnemyShotView {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly life: number;
  /** Monster shots (enemies.ts): 'goo' arcs, 'orb' boss volleys; unset = drone shot. */
  readonly style?: string;
  readonly vy?: number;
}

export interface DebrisView { readonly x: number; readonly y: number; readonly angle: number; readonly life: number }
export interface BlastView { readonly x: number; readonly y: number; readonly color: string; readonly life: number }
export interface ParticleView {
  readonly x: number; readonly y: number; readonly life: number; readonly max: number;
  readonly size: number; readonly color: string;
}

export interface LevelView {
  readonly sky: string;
  readonly haze: string;
  readonly far: string;
  readonly near: string;
  readonly dirt: string;
  readonly rim: string;
  readonly moon: string;
  readonly glow: string;
  readonly skyline: string; // 'ridges' | 'towers'
  readonly exit: number;
  readonly checkpoint: number;
}

export interface WorldView {
  readonly camera: number;
  readonly tick: number;
  readonly level: number;
  readonly versus: boolean;
  readonly dimension: LevelView;
  readonly surfaces: readonly SurfaceView[];
  readonly orbs: readonly PickupView[];
  readonly obstacles: readonly ObstacleView[];
  readonly projectiles: readonly ShotView[];
  readonly enemyShots: readonly EnemyShotView[];
  readonly runners: readonly RunnerView[];
  readonly entrants: readonly RunnerView[];
  readonly debris: readonly DebrisView[];
  readonly blasts: readonly BlastView[];
  readonly particles: readonly ParticleView[];
  readonly portalPull: number;
  readonly riftFlash: number;
  readonly flash: number;
  readonly shake: number;
}
