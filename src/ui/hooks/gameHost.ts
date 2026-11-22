// One Phaser.Game for the whole app lifetime. It renders into a host div that lives outside React:
// the GameScreen attaches the host to its .race-stage while a run is on screen and detaches it on the menu.
// The GameScene subscribes to the bus in its constructor, so a second game would double every command;
// a module-level singleton also keeps React StrictMode's mount/unmount/mount from creating two.
import type Phaser from 'phaser';
import { createGame } from '../../phaser/createGame';

let host: HTMLDivElement | null = null;
let game: Phaser.Game | null = null;
let stage: HTMLElement | null = null;

function getHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement('div');
    host.className = 'phaser-host';
    // Fills .race-stage; the game's ResizeObserver resizes the canvas to it.
    host.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  }
  return host;
}

/** Creates the game on first use. Safe to call any number of times. */
export function ensureGame(): Phaser.Game {
  if (!game) game = createGame(getHost());
  return game;
}

/** Moves the game host into the stage element (and back out with null). */
export function attachStage(element: HTMLElement | null): void {
  const el = getHost();
  if (element) {
    stage = element;
    if (el.parentElement !== element) element.prepend(el);
    ensureGame();
  } else {
    if (stage && el.parentElement === stage) el.remove();
    stage = null;
  }
}

/** Gives the course keyboard focus (so Space/Enter never land on a header button mid-run). */
export function focusStage(): void {
  stage?.focus({ preventScroll: true });
}
