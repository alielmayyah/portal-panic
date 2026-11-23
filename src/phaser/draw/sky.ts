import type Phaser from 'phaser';
import atlasUrl from '../../assets/dimensions.webp?inline';
import { GROUND_Y, H, type LevelView } from './view';
import { type G, type Pt, arc, gradientRect, mod, oval, rand, rect, shape } from './prims';

const ATLAS_KEY = 'dimension-landscapes';
const FRAME_WIDTH = 768;
const FRAME_HEIGHT = 256;
export type Panorama = Phaser.GameObjects.Image;

export function preloadPanoramas(scene: Phaser.Scene): void {
  scene.load.spritesheet(ATLAS_KEY, atlasUrl, { frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT });
}

export function createPanorama(scene: Phaser.Scene): Panorama | undefined {
  if (!scene.textures.exists(ATLAS_KEY)) return;
  return scene.add.image(0, H, ATLAS_KEY, 0).setOrigin(0, 1).setScrollFactor(0, 1).setDepth(-1).setVisible(false);
}

/** The horizon stays anchored as the camera zooms out. Each painting pans once across the level. */
export function drawSky(g: G, camera: number, p: LevelView, viewWidth: number, viewTop: number, panorama?: Panorama, level = 0): void {
  if (panorama) {
    const padding = 12;
    const scale = Math.max((viewWidth * 1.12 + padding * 2) / FRAME_WIDTH, (H - viewTop + padding * 2) / FRAME_HEIGHT);
    const excess = FRAME_WIDTH * scale - viewWidth - padding * 2;
    const progress = Math.max(0, Math.min(1, camera / Math.max(1, p.exit - viewWidth * .5)));
    if (Number(panorama.frame.name) !== level) panorama.setFrame(level);
    panorama.setPosition(g.x - padding - excess * (.07 + progress * .86), H + padding).setScale(scale).setVisible(true);
    rect(g, '#23162e', -padding, viewTop - padding, viewWidth + padding * 2, H - viewTop + padding * 2, .07);
    return;
  }
  gradientRect(g, -12, viewTop - 12, viewWidth + 24, H - viewTop + 24, p.sky, p.haze);
  drawPlanet(g, viewWidth * .68 - camera * .012, 112, p);
}

export function drawPlanet(g: G, x: number, y: number, p: LevelView): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(-.23);
  arc(g, p.moon, 3, 0, 0, 93, 15, Math.PI, Math.PI * 2);
  oval(g, 0, 0, 47, 47, p.moon);
  for (const [cx, cy, rx, ry] of [[-16, -20, 9, 3], [15, 14, 6, 2], [-24, 17, 8, 3]]) oval(g, cx, cy, rx, ry, p.rim);
  arc(g, p.rim, 5, 0, 0, 93, 15, 0, Math.PI);
  arc(g, p.moon, 1.5, 0, 0, 101, 19, -.2, Math.PI);
  g.restore();
}

/** Low, staggered silhouettes cross the painted horizon at a second parallax speed. */
export function drawRidges(g: G, camera: number, p: LevelView, viewWidth: number): void {
  const span = 118;
  const scroll = camera * .43;
  const first = Math.floor(scroll / span) - 1;
  const end = first + Math.ceil(viewWidth / span) + 3;
  const silhouette: Pt[] = [];
  for (let n = first; n <= end; n++) {
    const x = n * span - scroll;
    const y = GROUND_Y + 21 + rand(n * 7) * 32;
    silhouette.push([x, y], [x + span * .3, y - rand(n) * 9], [x + span * .72, y + 7]);
    if (n % 3 === 0) {
      const h = 12 + rand(n + 11) * 22;
      const tip = mod(n, 5) * 2;
      shape(g, p.near, [[x + 8, y], [x + 12, y - h * .37], [x + 16 + tip, y - h],
        [x + 18 + tip, y - h * .91], [x + 19, y - h * .31], [x + 28, y + 3]]);
    }
  }
  silhouette.push([end * span - scroll + span, H + 16], [first * span - scroll, H + 16]);
  shape(g, p.near, silhouette);
}
