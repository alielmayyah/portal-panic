// Composes a full frame in the same order as render() in src/game/render.js.
//
// Layer setup (in the scene):
//   camera.setOrigin(0, 0); camera.setZoom(scale);
//   camera.scrollX = world.camera; camera.scrollY = -offsetY / scale   (offsetY = height - H * scale)
//   bg      = add.graphics().setScrollFactor(0, 1)   // sky + parallax, view-relative x
//   world   = add.graphics()                         // everything in world units
//   overlay = add.graphics().setScrollFactor(0, 1)   // rift / hit flash tint (optional)
// Each frame: drawWorld({ bg, world, overlay }, world, { viewWidth, viewTop, reduceMotion, ... }).
// Screen shake is left to camera.shake (render.js translated the whole frame by w.shake).
import { H, type RunnerView, type WorldView } from './view';
import { type G, rect, withAlpha } from './prims';
import { drawRidges, drawSky, type Panorama } from './sky';
import { type Visible, drawCheckpoint, drawGround, drawPortal } from './terrain';
import { drawCrystal, drawDrone, drawHitFlash, drawSlime, drawWall } from './hazards';
import { type DustPuff, drawBlast, drawCell, drawDebris, drawDustPuff, drawGadget, drawParticles, drawPulse, drawRocket } from './items';
import { drawRunner } from './runner';
import { drawFreezeTint, drawPowerAura, drawPowerPickup, drawPowerTimers, isPowerKind, powerAlpha, viewFrozen, withPowerScale } from './powers';
import { GADGET_COLORS } from './view';
import { drawWeapons } from './weapons';
import { drawEnemyBackLayer, drawMonster, drawMonsterShot, isMonsterView } from './enemies';

export * from './view';
export { paint, withAlpha, type G, type Pt } from './prims';
export { drawSky, drawPlanet, drawRidges } from './sky';
export { drawGround, drawCheckpoint, drawPortal, type Visible } from './terrain';
export { drawCrystal, drawDrone, drawWall, drawSlime, drawHitFlash } from './hazards';
export { drawCell, drawGadget, drawRocket, drawPulse, drawDebris, drawBlast, drawParticles, drawDustPuff, dustPuffFor, type DustPuff } from './items';
export { drawRunner, type RunnerDrawOptions } from './runner';
export * from './powers';
export { drawMonster, drawMonsterShot, drawPortalSeal, isMonsterView, type MonsterView, type MobView } from './enemies';

export interface DrawLayers {
  panorama?: Panorama;
  /** Sky and parallax, scrollFactor (0, 1). */
  bg: G;
  /** World-space layer, scrollFactor 1. */
  world: G;
  /** Optional full-view tint layer, scrollFactor (0, 1), drawn above everything. */
  overlay?: G;
}

export interface DrawOptions {
  /** Visible width in world units (canvas width / scale). */
  viewWidth: number;
  /** Top of the visible area in world units: Math.min(0, -offsetY / scale). */
  viewTop?: number;
  preview?: boolean;
  reduceMotion?: boolean;
  /** Dust puffs from 'duck' events, owned and aged by the caller. */
  puffs?: readonly DustPuff[];
  /** Skip clearing the layers (when the caller draws extra things first). */
  noClear?: boolean;
}

/** Portal centre used by drawWorld and by the portal-pull animation. */
export const PORTAL_Y = 244;
export const PULL_Y = 254;
export const PREVIEW_EXIT = 561;

export function drawWorld(layers: DrawLayers, w: WorldView, opts: DrawOptions): void {
  const { bg, world: g, overlay } = layers;
  const { viewWidth, viewTop = 0, preview = false, reduceMotion = false, puffs } = opts;
  const t = reduceMotion ? 0 : w.tick;
  const p = w.dimension;
  if (!opts.noClear) { bg.clear(); g.clear(); overlay?.clear(); }

  drawSky(bg, w.camera, p, viewWidth, viewTop, layers.panorama, w.level);
  drawRidges(bg, w.camera, p, viewWidth);

  const visible: Visible = (x, width = 0) => x + width > w.camera - 100 && x < w.camera + viewWidth + 100;
  const exit = preview ? PREVIEW_EXIT : p.exit;
  if (visible(exit, 50)) drawPortal(g, exit, PORTAL_Y, t, .9 + w.riftFlash * .08);
  if (!preview && visible(exit, 50)) drawEnemyBackLayer(g, w.obstacles, exit, PORTAL_Y, t);
  drawGround(g, w.camera, w.surfaces, p, viewWidth, visible);
  if (!preview && visible(p.checkpoint)) drawCheckpoint(g, p.checkpoint, w.runners.some((r) => r.checkpoint));

  for (const orb of w.orbs) {
    if (orb.taken || !visible(orb.wx)) continue;
    if (isPowerKind(orb.kind)) drawPowerPickup(g, orb, t);
    else if (GADGET_COLORS[orb.kind]) drawGadget(g, orb, t);
    else drawCell(g, orb, orb.wx, t);
  }
  for (const ob of w.obstacles) {
    if (ob.broken || !visible(ob.wx, ob.w)) continue;
    if (ob.type === 'wall') drawWall(g, ob);
    else if (ob.type === 'crystal') drawCrystal(g, ob, ob.wx, t);
    else if (ob.type === 'slime') drawSlime(g, ob, t);
    else if (isMonsterView(ob)) drawMonster(g, ob, t);
    else drawDrone(g, ob, ob.wx, t);
    if (ob.flash && ob.type !== 'wall') drawHitFlash(g, ob);
  }
  for (const shot of w.projectiles) {
    if (!visible(shot.wx)) continue;
    if (shot.kind === 'missile') drawRocket(g, shot);
    else drawPulse(g, shot.wx, shot.y, shot.dir);
  }
  for (const shot of w.enemyShots) {
    if (shot.life <= 0 || !visible(shot.x)) continue;
    if (shot.style) drawMonsterShot(g, shot, t);
    else drawPulse(g, shot.x, shot.y, Math.sign(shot.vx), true);
  }
  drawWeapons(g, w, t, visible);

  for (const r of w.runners) {
    if (!r.alive) continue;
    if (w.portalPull && w.entrants.includes(r)) {
      const remaining = 1 - w.portalPull;
      if (remaining <= 0) continue;
      g.save();
      g.translateCanvas(p.exit, PULL_Y);
      g.scaleCanvas(remaining, remaining);
      g.translateCanvas(-p.exit, -PULL_Y);
      withAlpha(remaining, () => drawRunner(g, r, { shadow: false, armed: true, t }));
      g.restore();
      continue;
    }
    const blink = r.invuln && !reduceMotion && t % 10 < 5 ? .65 : 1;
    drawPowerAura(g, r, t, reduceMotion);
    withAlpha(blink * powerAlpha(r, t, reduceMotion), () => withPowerScale(g, r, () => drawRunner(g, r, { armed: true, t })));
    if (!preview) drawPowerTimers(g, r);
  }
  if (puffs) for (const puff of puffs) if (visible(puff.x)) drawDustPuff(g, puff);

  for (const chunk of w.debris) if (visible(chunk.x)) drawDebris(g, chunk);
  for (const blast of w.blasts) drawBlast(g, blast);
  drawParticles(g, w.particles);

  if (overlay) {
    drawFreezeTint(overlay, viewFrozen(w.runners), viewWidth, viewTop, H, reduceMotion);
    drawFlash(overlay, w, viewWidth, viewTop, reduceMotion);
  }
}

/** Full-view tint for portal crossing (green) or a death hit (pink). View-relative x. */
export function drawFlash(g: G, w: Pick<WorldView, 'riftFlash' | 'flash'>, viewWidth: number, viewTop = 0, reduceMotion = false): void {
  if (reduceMotion || Math.max(w.riftFlash, w.flash) <= 0) return;
  if (w.riftFlash > 0) rect(g, '#bbff55', 0, viewTop, viewWidth, H - viewTop, w.riftFlash * .24);
  else rect(g, '#ff9bab', 0, viewTop, viewWidth, H - viewTop, w.flash * .16);
}

export interface WorldLabel { text: string; x: number; y: number; color: string; size: number }

export interface LabelOptions {
  viewWidth: number;
  preview?: boolean;
  /** Canvas scale (device px per world unit) and device pixel ratio, to keep text >= 10 CSS px. */
  scale?: number;
  pixelRatio?: number;
  levelCount?: number;
  /** Text width measure in world units; defaults to a monospace estimate (0.6em per char). */
  measure?: (text: string, size: number) => number;
}

/**
 * Text the old renderer drew with fillText (Graphics cannot draw text): the portal caption
 * and versus name tags. World coordinates, centre-aligned baseline. Render with pooled
 * Phaser Text objects (origin (0.5, 1), bold monospace, `size` px in world units).
 */
export function worldLabels(w: WorldView, o: LabelOptions): WorldLabel[] {
  const { viewWidth, preview = false, scale = 1, pixelRatio = 1, levelCount = 3 } = o;
  const measure = o.measure ?? ((text: string, size: number) => text.length * size * .6);
  const minText = 10 * pixelRatio / scale;
  const out: WorldLabel[] = [];
  const p = w.dimension;
  const visible = (x: number, width = 0) => x + width > w.camera - 100 && x < w.camera + viewWidth + 100;
  if (!preview && visible(p.exit, 50)) {
    out.push({ text: w.level === levelCount - 1 || w.versus ? 'FINISH PORTAL' : 'NEXT DIMENSION', x: p.exit, y: 137, color: '#e6ffac', size: Math.max(13, minText) });
  }
  if (w.versus && !preview) {
    w.runners.forEach((r: RunnerView, index) => {
      if (!r.alive) return;
      if (w.portalPull && w.entrants.includes(r)) return;
      const size = Math.max(11, minText);
      const label = r.x + 22 < w.camera + 24 ? '◀ ' + r.name : r.name;
      const half = measure(label, size) / 2 + 4;
      const x = Math.max(w.camera + half, Math.min(w.camera + viewWidth - half, r.x + 22));
      const lift = w.runners.some((other) => other !== r && other.alive && Math.abs(other.x - r.x) < 60) ? index * 13 : 0;
      const y = r.x < w.camera || r.x > w.camera + viewWidth ? 67 + lift : Math.max(size + 4 + lift, r.feet - 86 - lift);
      out.push({ text: label, x, y, color: r.color, size });
    });
  }
  return out;
}
