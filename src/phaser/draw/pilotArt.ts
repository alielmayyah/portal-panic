import type { Pt } from './prims';

// The garage canvas and both Phaser backends use the same ink contours.
export interface PilotPen {
  plate(points: readonly Pt[], fill: string, edge?: string, width?: number): void;
  stroke(points: readonly Pt[], color: string, width: number): void;
  oval(x: number, y: number, rx: number, ry: number, fill: string, edge?: string, width?: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
}

export const INK = '#242436';
export const RICK_SKIN = '#e2d6b9';
export const MORTY_SKIN = '#ffc997';
const PAPER = '#fff7dd';
const curves = new Map<string, readonly Pt[]>();

// Each contour starts with x,y. Further pairs are line ends, Q introduces a
// quadratic control and end point. Subdivide once, before the next frame.
function contour(source: string): readonly Pt[] {
  const cached = curves.get(source);
  if (cached) return cached;
  const tokens = source.match(/Q|-?[\d.]+/g)!;
  const points: Pt[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i] !== 'Q') {
      points.push([+tokens[i++], +tokens[i++]]);
      continue;
    }
    i++;
    const [x0, y0] = points[points.length - 1];
    const cx = +tokens[i++], cy = +tokens[i++], x1 = +tokens[i++], y1 = +tokens[i++];
    const steps = Math.max(3, Math.min(10, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) / 4)));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps, u = 1 - t;
      points.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
  }
  curves.set(source, points);
  return points;
}

export function plate(p: PilotPen, fill: string, source: string, width = 2.4): void {
  p.plate(contour(source), fill, width ? INK : undefined, width);
}

export function mark(p: PilotPen, color: string, width: number, source: string): void {
  p.stroke(contour(source), color, width);
}

// Drawn at portrait resolution with the neck attachment at the local origin.
export function rickHead(p: PilotPen): void {
  // Asymmetric starburst. The longest spikes lean away from the direction of travel.
  plate(p, '#8dcbd5', '-20,-5 -41,-2 -34,-17 -55,-17 -45,-31 -65,-40 -48,-46 -64,-62 -43,-60 -52,-82 -31,-72 -34,-95 -15,-80 -7,-104 1,-82 18,-100 18,-79 39,-91 32,-71 49,-76 37,-54 38,-36 17,-16');
  plate(p, '#bae9e7', '-56,-59 -36,-55 -44,-75 -23,-64 -28,-86 -11,-70 -7,-94 1,-74 13,-88 13,-72 29,-82 24,-67 35,-67 14,-53 -23,-44', 0);
  plate(p, '#6199b2', '-39,-34 -51,-39 -37,-41 -44,-50 -24,-46 -16,-60 -5,-53 18,-60 25,-44 13,-13 -27,-6 -22,-18 -42,-17 -33,-25 -47,-26', 0);
  // Long temple, hooked profile and squared jaw.
  plate(p, RICK_SKIN, '-26,-30 Q-33,-45 -25,-57 Q-17,-71 1,-71 Q18,-72 28,-63 Q37,-56 33,-43 L32,-36 Q32,-31 39,-25 Q43,-21 35,-19 L34,-10 Q35,-2 25,1 Q15,7 5,4 Q-5,1 -13,-11 L-20,-20 Q-29,-16 -34,-26 Q-39,-37 -33,-39 Q-29,-41 -25,-36');
  plate(p, '#b6af9d', '-24,-37 Q-17,-37 -17,-29 Q-19,-19 -9,-11 Q0,-2 10,0 Q18,3 29,-1 Q14,9 4,3 Q-7,-1 -14,-12 L-20,-21 Q-28,-18 -33,-27 Q-36,-34 -32,-35 Q-28,-37 -24,-31', 0);
  mark(p, '#81786f', 1.7, '-32,-31 Q-28,-35 -24,-26 Q-27,-28 -28,-25');
  mark(p, '#aa9683', 1.7, '-13,-58 Q-2,-64 9,-61');
  mark(p, '#aa9683', 1.5, '-7,-62 Q3,-67 11,-64');
  // Far eye tucks behind the bridge. Lids and one continuous brow set his expression.
  plate(p, PAPER, '12,-44 Q19,-52 30,-49 Q37,-48 37,-42 Q37,-33 29,-32 Q18,-31 12,-40', 2);
  plate(p, PAPER, '-17,-46 Q-11,-53 1,-50 Q11,-49 14,-43 Q14,-33 4,-31 Q-6,-29 -13,-36 Q-17,-40 -17,-46', 2);
  plate(p, '#cfbfa5', '-17,-47 Q-2,-52 13,-44 L14,-41 Q-1,-43 -16,-44', 1.4);
  plate(p, '#cfbfa5', '15,-45 Q25,-51 35,-48 L36,-43 Q26,-44 17,-40', 1.4);
  p.oval(4, -39, 2.2, 2.5, INK);
  p.oval(30, -39, 1.9, 2.3, INK);
  plate(p, '#82c0cd', '-21,-50 Q-16,-59 -5,-57 Q6,-55 13,-51 Q22,-53 31,-57 L36,-54 Q36,-51 30,-49 Q20,-45 13,-45 Q3,-48 -7,-51 Q-14,-53 -20,-48', 2);
  mark(p, '#81786f', 1.7, '-13,-32 Q-5,-26 3,-29');
  mark(p, '#81786f', 1.55, '23,-29 Q30,-27 34,-30');
  mark(p, INK, 2, '13,-41 Q12,-36 19,-30 Q24,-24 18,-23 Q14,-22 11,-24');
  // Crooked, gritted mouth with the little green drip at the corner.
  plate(p, '#6f4c4c', '-2,-14 Q7,-18 17,-15 Q25,-13 30,-16 Q29,-8 19,-9 Q10,-12 4,-11 Q0,-11 -2,-14', 1.8);
  plate(p, '#f4e7c7', '2,-14 Q8,-16 17,-14 Q22,-12 27,-14 Q23,-10 17,-12 Q10,-14 2,-13', 0);
  plate(p, '#91be70', '-2,-15 Q3,-16 5,-12 Q3,-11 3,-7 Q2,-4 0,-6 L0,-10 Q-3,-8 -4,-11 Q-5,-13 -2,-15', 1.1);
  mark(p, '#918272', 1.5, '9,-4 Q15,-6 21,-4');
}

export function mortyHead(p: PilotPen): void {
  // Round mop with a scalloped edge, a prominent cowlick and warm reflected light.
  plate(p, '#784530', '-34,-15 Q-46,-19 -45,-32 Q-53,-38 -46,-48 Q-49,-60 -37,-65 Q-33,-79 -18,-77 Q-10,-89 5,-81 Q17,-86 28,-76 Q40,-77 44,-64 Q53,-60 48,-48 Q51,-37 39,-26 L24,-8 -12,-2');
  plate(p, '#a36540', '-43,-50 Q-45,-60 -32,-62 Q-29,-75 -17,-71 Q-6,-83 5,-75 Q18,-80 28,-69 Q40,-70 43,-60 Q35,-66 26,-61 Q12,-71 1,-63 Q-10,-70 -19,-60 Q-30,-65 -33,-54', 0);
  plate(p, MORTY_SKIN, '-27,-28 Q-28,-51 -14,-60 Q-3,-68 11,-65 Q31,-66 39,-52 Q44,-45 42,-33 Q43,-28 47,-25 Q49,-20 43,-18 Q41,-7 31,0 Q22,9 8,9 Q-11,8 -21,-5 Q-25,-10 -27,-15 Q-34,-11 -39,-17 Q-44,-27 -38,-31 Q-32,-35 -27,-28', 2.7);
  plate(p, '#e6a07a', '-26,-28 Q-19,-29 -20,-19 Q-19,-5 -5,1 Q10,9 23,5 Q33,3 39,-5 Q30,10 8,8 Q-7,8 -18,-3 Q-24,-8 -27,-16 Q-34,-12 -39,-20 Q-40,-27 -36,-27 Q-30,-29 -26,-23', 0);
  plate(p, '#805038', '-34,-31 Q-31,-42 -31,-52 Q-25,-60 -15,-61 Q-11,-68 0,-65 Q11,-72 22,-64 Q28,-65 34,-59 Q26,-58 24,-51 Q21,-56 18,-57 Q8,-52 0,-56 Q-4,-48 -14,-48 Q-14,-41 -22,-36 L-24,-26 Q-28,-33 -34,-31', 1.8);
  mark(p, '#a66152', 1.6, '-37,-23 Q-32,-28 -28,-19 Q-32,-22 -32,-18');
  plate(p, PAPER, '16,-37 Q17,-48 27,-48 Q38,-49 41,-38 Q44,-25 34,-22 Q24,-19 17,-28', 2);
  plate(p, PAPER, '-18,-37 Q-16,-49 -4,-48 Q8,-49 14,-37 Q19,-23 7,-20 Q-5,-15 -14,-24 Q-19,-29 -18,-37', 2.1);
  p.oval(5, -32, 2.9, 3.2, INK);
  p.oval(32, -33, 2.5, 2.8, INK);
  mark(p, '#503b36', 2.4, '-18,-46 Q-9,-49 -4,-53');
  mark(p, '#503b36', 2.25, '23,-53 Q29,-52 35,-47');
  mark(p, INK, 1.8, '14,-31 Q14,-27 20,-24 Q25,-20 21,-18 Q18,-17 15,-19');
  plate(p, '#7c464a', '0,-7 Q6,-16 14,-13 Q19,-11 26,-11 Q30,-10 28,-7 Q25,-3 19,-5 Q10,-8 5,-5 Q1,-3 0,-7', 1.8);
  plate(p, '#fff3cd', '5,-10 Q9,-14 14,-11 Q19,-9 25,-10 Q23,-7 17,-8 Q10,-10 5,-9', 0);
  mark(p, '#af7962', 1.4, '8,0 Q13,-2 17,0');
}
