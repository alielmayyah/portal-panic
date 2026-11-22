// Menu preview: Rick and Morty bouncing in front of the selected level (port of the demo in the old main.js frame()).
import Phaser from 'phaser';
import { store } from '../core/store';
import type { Obstacle, Pickup } from '../core/types';
import { GROUND_Y, H, STEP_MS, W, World, createRunner } from '../core/world';
import { drawWorld } from './draw';
import { CHARACTERS } from './GameScene';
import { onMotionChange, placeCamera, reducedMotion } from './viewport';

const selectedLevel = (): number => {
  const state = store.getState();
  return state.selectedLevels[state.mode];
};

/** The fixed props the preview shows in place of the level's own hazards and pickups. */
function previewProps(): { obstacles: Obstacle[]; orbs: Pickup[] } {
  const slime: Obstacle = {
    type: 'slime', wx: 703, y: 298, w: 52, h: 42, phase: 1, hp: 1,
    x: 703, baseX: 703, baseY: 298, maxHp: 1, charge: 0, readyAt: 70, flash: 0,
  };
  return {
    obstacles: [slime],
    orbs: [
      { kind: 'shield', wx: 416, y: 222, phase: 2, r: 14 },
      { kind: 'boots', wx: 650, y: 200, phase: 3, r: 14 },
    ],
  };
}

export class PreviewScene extends Phaser.Scene {
  private demo = new World({ runner: createRunner({ ...CHARACTERS.rick, x: 221 }), rival: createRunner({ ...CHARACTERS.morty, x: 274 }) });
  private demoTick = 0;
  private level = -1;
  private needsDraw = true;
  private drawnSize: [number, number] = [0, 0];
  private bg!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Graphics;
  private cleanup: (() => void)[] = [];

  constructor() { super({ key: 'preview' }); }

  create(): void {
    this.bg = this.add.graphics().setScrollFactor(0, 1);
    this.layer = this.add.graphics();
    this.syncLevel();
    this.cleanup.push(
      store.subscribe(() => this.syncLevel()),
      onMotionChange(() => { this.needsDraw = true; }),
    );
    this.game.events.once(Phaser.Core.Events.DESTROY, () => { for (const fn of this.cleanup.splice(0)) fn(); });
  }

  private syncLevel(): void {
    const level = selectedLevel();
    if (level === this.level) return;
    this.level = level;
    const demo = this.demo;
    demo.loadLevel(level);
    for (const runner of demo.runners) runner.invuln = 0;
    const { obstacles, orbs } = previewProps();
    demo.obstacles = obstacles;
    demo.orbs = orbs;
    this.needsDraw = true;
  }

  override update(_time: number, delta: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    // A collapsed or detached box would give a near-zero scale; wait for a real size.
    if (width < 32 || height < 32) return;
    const still = reducedMotion();
    const resized = width !== this.drawnSize[0] || height !== this.drawnSize[1];
    if (still && !this.needsDraw && !resized) return;
    const demo = this.demo;
    if (!still) {
      this.demoTick += Math.min(delta, 75) / STEP_MS;
      const t = this.demoTick;
      demo.tick = t;
      demo.runners.forEach((runner, i) => {
        runner.vx = 2;
        runner.x = 220 + i * 62 + Math.sin(t * .022 + i) * 20;
        runner.feet = GROUND_Y - Math.pow(Math.max(0, Math.sin(t * .038 + i * 1.4)), 2) * 63;
        runner.grounded = runner.feet === GROUND_Y;
        runner.anim = t * .21;
      });
    }
    // The preview fills its box (cover), anchored to the bottom like the old canvas.
    const scale = Math.max(width / W, height / H);
    const viewWidth = width / scale;
    const offsetY = height - H * scale;
    placeCamera(this.cameras.main, scale, offsetY, 0);
    drawWorld({ bg: this.bg, world: this.layer }, demo, { viewWidth, viewTop: Math.min(0, -offsetY / scale), preview: true, reduceMotion: still });
    this.needsDraw = false;
    this.drawnSize = [width, height];
  }
}
