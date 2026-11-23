import type { Pt } from './prims';
import type { PilotPen } from './pilotArt';
import { drawPilot, type PilotState } from './pilotFigure';
import { GADGET_COLORS } from './view';

type Ctx = CanvasRenderingContext2D;
export type PortraitRunner = PilotState;
export interface PortraitOptions { shadow?: boolean; armed?: boolean }

function canvasPen(c: Ctx): PilotPen {
  const path = (points: readonly Pt[]) => {
    c.beginPath();
    c.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) c.lineTo(...points[i]);
  };
  const finish = (fill: string, edge?: string, width = 1) => {
    c.fillStyle = fill;
    c.fill();
    if (edge) { c.strokeStyle = edge; c.lineWidth = width; c.stroke(); }
  };
  return {
    plate(points, fill, edge, width) {
      path(points);
      c.closePath();
      finish(fill, edge, width);
    },
    stroke(points, color, width) {
      path(points);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    },
    oval(x, y, rx, ry, fill, edge, width) {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      finish(fill, edge, width);
    },
    save: () => c.save(),
    restore: () => c.restore(),
    translate: (x, y) => c.translate(x, y),
    scale: (x, y) => c.scale(x, y),
    rotate: (angle) => c.rotate(angle),
  };
}

export function drawRunnerToCanvas(c: Ctx, r: PortraitRunner, { shadow = true, armed = false }: PortraitOptions = {}): void {
  const p = canvasPen(c);
  c.save();
  c.translate((r.x ?? 0) + 22, r.feet ?? 0);
  c.scale(r.facing || 1, 1);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const low = r.ducking || (r.grounded !== false && (r.sliding ?? 0) > 0);
  if (shadow && r.grounded !== false) p.oval(0, 2, low ? 23 : 15, 2.6, '#17182a60');
  if (r.shield) p.oval(0, low ? -20 : -37, low ? 31 : 29, low ? 25 : 44, '#71edf324', GADGET_COLORS.shield, 1.8);
  if (r.boots) p.oval(0, -3, 17, 4, '#dfa0ff7a');
  drawPilot(p, r, armed);
  c.restore();
}

export function drawPortrait(canvas: HTMLCanvasElement, character: string): void {
  canvas.width = 176;
  canvas.height = 208;
  const c = canvas.getContext('2d');
  if (!c) return;
  const morty = character === 'morty';
  const zoom = morty ? 4.8 : 4.04;
  c.setTransform(zoom, 0, 0, zoom, 0, 0);
  drawRunnerToCanvas(c, { character, x: morty ? -5.8 : 0, feet: morty ? 69 : 81 }, { shadow: false });
}
