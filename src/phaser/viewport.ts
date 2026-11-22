// Shared Phaser setup for the game and the menu preview: a HiDPI canvas that tracks its parent.
//
// Phaser 3.90 has no `resolution` game setting and Scale.RESIZE sizes the canvas in CSS pixels, which
// is blurry on high-density screens. So the canvas runs in Scale.NONE at parent size x devicePixelRatio
// (capped at 2, like the old drawCanvas), is stretched back to the parent with CSS, and a ResizeObserver
// keeps it in step. Every size the scenes see is in device pixels.
import Phaser from 'phaser';

export const MAX_DPR = 2;
export const pixelRatio = (): number => Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = (): boolean => Boolean(motionQuery?.matches);
export function onMotionChange(listener: () => void): () => void {
  motionQuery?.addEventListener('change', listener);
  return () => motionQuery?.removeEventListener('change', listener);
}

/** Canvas size (CSS px) used while the parent has no layout yet (detached, display:none). */
const FALLBACK_SIZE: readonly [number, number] = [960, 420];
/** Parents smaller than this (CSS px) are treated as collapsed: the canvas keeps its last size. */
const MIN_PARENT_PX = 8;

/** Parent size in device px, or null while the parent is detached or collapsed to (almost) 0x0. */
export function parentSize(parent: HTMLElement): [number, number] | null {
  const { clientWidth: w, clientHeight: h } = parent;
  if (!parent.isConnected || w < MIN_PARENT_PX || h < MIN_PARENT_PX) return null;
  const dpr = pixelRatio();
  return [Math.round(w * dpr), Math.round(h * dpr)];
}

export function makeGame(parent: HTMLElement, scene: Phaser.Scene, backgroundColor: string): Phaser.Game {
  // Never boot (or resize) to 0x0: WebGL would warn about empty textures and the camera scale would collapse.
  const dpr = pixelRatio();
  const [width, height] = parentSize(parent) ?? [Math.round(FALLBACK_SIZE[0] * dpr), Math.round(FALLBACK_SIZE[1] * dpr)];
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    transparent: false,
    backgroundColor,
    pixelArt: false,
    antialias: true,
    banner: false,
    // Sound comes from src/audio (synthesized Web Audio); Phaser's audio system stays off.
    audio: { noAudio: true },
    // Keyboard and touch are handled with DOM listeners (and the React touch controls via the bus).
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    disableContextMenu: false,
    fps: { smoothStep: false },
    scale: { mode: Phaser.Scale.NONE, width, height, autoRound: true, expandParent: false },
    scene: [scene],
  });
  const stretch = () => {
    const style = game.canvas?.style;
    if (!style) return;
    style.width = '100%';
    style.height = '100%';
    style.display = 'block';
    style.touchAction = 'none';
  };
  // The canvas exists once the game boots (synchronously when the document is already loaded).
  if (game.canvas) stretch();
  else game.events.once(Phaser.Core.Events.BOOT, stretch);
  const fit = () => {
    if (!game.isBooted) return;
    const size = parentSize(parent);
    if (!size) return;
    const [w, h] = size;
    if (w !== game.scale.width || h !== game.scale.height) game.scale.resize(w, h);
    stretch();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  observer?.observe(parent);
  // The parent may have gained its layout while Phaser was booting.
  game.events.once(Phaser.Core.Events.READY, fit);
  // A dpr change (zoom, moving the window to another screen) does not resize the parent.
  addEventListener('resize', fit);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    observer?.disconnect();
    removeEventListener('resize', fit);
  });
  return game;
}

/**
 * Points a scene camera so world units map like the old canvas transform:
 * screen = (world - (scrollX, scrollY)) * scale, with y = 0 at offsetY device pixels from the top.
 */
export function placeCamera(camera: Phaser.Cameras.Scene2D.Camera, scale: number, offsetY: number, scrollX: number, shakeY = 0): void {
  camera.setOrigin(0, 0);
  if (camera.zoom !== scale) camera.setZoom(scale);
  camera.setScroll(scrollX, -offsetY / scale - shakeY);
}
