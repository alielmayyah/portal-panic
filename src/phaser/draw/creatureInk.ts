import { type G, type Pt, INK, line, shape } from './prims';

// Illustrations use small local coordinates. A four-number segment is a quadratic
// Bézier (control, end). Flatten static paths once for the Phaser polygon renderer.
const paths = new Map<string, Pt[]>();

function points(path: string): Pt[] {
  const saved = paths.get(path);
  if (saved) return saved;
  const outline: Pt[] = [];
  for (const command of path.split('/')) {
    const [a, b, x, y] = command.trim().split(/\s+/).map(Number);
    const start = outline[outline.length - 1];
    if (x === undefined) {
      outline.push([a, b]);
      continue;
    }
    const length = Math.hypot(a - start[0], b - start[1]) + Math.hypot(x - a, y - b);
    const steps = Math.max(3, Math.min(14, Math.ceil(length / 4)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      outline.push([u * u * start[0] + 2 * u * t * a + t * t * x, u * u * start[1] + 2 * u * t * b + t * t * y]);
    }
  }
  paths.set(path, outline);
  return outline;
}

export function ink(g: G, fill: string, contour: string, weight = 1.8): void {
  shape(g, fill, points(contour), weight > 0 ? INK : undefined, weight);
}

export function stroke(g: G, color: string, width: number, contour: string): void {
  line(g, color, width, points(contour));
}
