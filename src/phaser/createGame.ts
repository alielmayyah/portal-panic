// Entry points the React views call. Both return a Phaser.Game the caller destroys on unmount (game.destroy(true)).
import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { PreviewScene } from './PreviewScene';
import { makeGame } from './viewport';

/**
 * The race. The scene listens on the bus from the moment this returns, so a 'start' emitted right after
 * (before Phaser finishes booting) is kept and run once the scene is created.
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const scene = new GameScene();
  const game = makeGame(parent, scene, '#21162c');
  game.events.once(Phaser.Core.Events.DESTROY, () => scene.dispose());
  return game;
}

/** The garage preview (demo runners in front of the selected level). Sleeps while scrolled out of view. */
export function createPreview(parent: HTMLElement): Phaser.Game {
  const game = makeGame(parent, new PreviewScene(), '#21162c');
  if (typeof IntersectionObserver === 'function') {
    let asleep = false;
    const observer = new IntersectionObserver((entries) => {
      const onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      if (!game.isBooted || onScreen !== asleep) return;
      asleep = !onScreen;
      if (asleep) game.loop.sleep();
      else game.loop.wake();
    });
    observer.observe(parent);
    game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
  }
  return game;
}

export { GameScene, PreviewScene };
export { COUNTDOWN_MS, CROSSING_MS, PULL_MS } from './GameScene';
