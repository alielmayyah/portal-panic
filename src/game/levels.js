export const GROUND_Y = 340;
export const PLATFORM_DEPTH = 18;

const ground = (...ranges) => ranges.map(([x, end]) => ({ x, w: end - x, y: GROUND_Y }));
const ledges = (...ranges) => ranges.map(([x, w, y, travel = 0]) => ({ x, w, y, travel, phase: x * .013 }));
const hazards = (...items) => items.map(([type, wx, floor = GROUND_Y, variant = 0]) => {
  if (type === 'wall') return { type, wx, w: 38, h: 244, y: floor - 244, hp: variant };
  if (type === 'drone') return { type, wx, w: 46, h: 28, y: floor - 83, phase: wx * .03, patrol: 36, lift: 26, volley: variant, hp: 2 };
  if (type === 'slime') return { type, wx, w: 52, h: 42, y: floor - 42, phase: wx * .03, patrol: variant, hp: 2 };
  return { type, wx, w: variant ? 54 : 29, h: variant ? 48 : 39, y: floor - (variant ? 48 : 39), shards: variant ? 2 : 1, tint: wx % 3 ? .21 : .75, hp: variant ? 2 : 1 };
});
const pickups = (...items) => items.map(([wx, y, kind = 'cell']) => ({ wx, y, kind, phase: wx * .07, r: kind === 'cell' ? 10 : 14 }));

export const LEVELS = [
  {
    code: 'C-137', name: 'Alien Badlands', width: 3030, checkpoint: 1470, exit: 2895,
    sky: '#250e39', haze: '#a94b81', far: '#653957', near: '#362042', dirt: '#2c1837', rim: '#d898ae', moon: '#f6b19c',
    floors: ground([0, 760], [865, 1640], [1770, 2370], [2510, 3030]),
    platforms: ledges([330, 150, 259], [583, 114, 246], [902, 145, 264], [1195, 116, 241], [1685, 125, 272], [2003, 127, 249], [2418, 120, 272], [2545, 134, 244]),
    hazards: hazards(['slime', 462, 340, 48], ['crystal', 623], ['crystal', 1016, 264], ['drone', 1263, 340, 1], ['wall', 1550, 340, 4], ['crystal', 1890, 340, 1], ['slime', 2146, 340, 57], ['drone', 2635], ['wall', 2740, 340, 4]),
    pickups: pickups([475, 222], [692, 304, 'shield'], [944, 216], [1374, 310], [1522, 300, 'boots'], [1697, 238], [2070, 214], [2435, 250], [2680, 210]),
  },
  {
    code: 'J-19ζ7', name: 'Cronenberg Wastes', width: 3430, checkpoint: 1690, exit: 3280,
    sky: '#361026', haze: '#b6504f', far: '#7a3648', near: '#46203c', dirt: '#2f1729', rim: '#e1997b', moon: '#ffca7e',
    floors: ground([0, 640], [770, 1240], [1393, 1910], [2050, 2470], [2630, 3430]),
    platforms: ledges([274, 142, 250], [687, 108, 271], [814, 124, 237], [1020, 146, 265], [1290, 128, 267, 38], [1505, 107, 241], [1956, 128, 267], [2220, 120, 230], [2517, 145, 268, 32], [2862, 124, 262], [3070, 119, 228]),
    hazards: hazards(['slime', 415, 340, 56], ['wall', 547, 340, 5], ['drone', 921, 340, 1], ['crystal', 1095, 265, 1], ['slime', 1539, 340, 52], ['drone', 1790, 340, 1], ['crystal', 2170, 340, 1], ['wall', 2301, 340, 5], ['slime', 2390, 340, 23], ['crystal', 2720], ['drone', 3008, 340, 1], ['slime', 3150, 340, 29]),
    pickups: pickups([350, 211], [620, 239], [843, 202, 'shield'], [1164, 305], [1304, 225], [1615, 304], [1738, 305, 'boots'], [2040, 222], [2280, 195], [2494, 225], [2675, 208], [2914, 227, 'shield'], [3132, 194]),
  },
  {
    code: 'C-500A', name: 'The Citadel', width: 3780, checkpoint: 1750, exit: 3615,
    sky: '#111c3b', haze: '#49699b', far: '#424a78', near: '#292c54', dirt: '#181b34', rim: '#a0aee1', moon: '#b7dbe8',
    floors: ground([0, 570], [720, 1120], [1260, 1910], [2108, 2500], [2650, 3000], [3160, 3780]),
    platforms: ledges([231, 111, 262], [410, 79, 257], [618, 125, 259], [852, 144, 234], [1168, 123, 263, 35], [1432, 134, 254], [1608, 118, 222], [1962, 162, 274, 36], [2210, 149, 257], [2547, 130, 267, 34], [2808, 112, 250], [3048, 137, 267], [3360, 125, 253]),
    hazards: hazards(['crystal', 372, 340, 1], ['wall', 517, 340, 5], ['drone', 839, 340, 2], ['slime', 986, 340, 56], ['crystal', 1370], ['drone', 1488, 340, 2], ['wall', 1582, 340, 5], ['drone', 1803], ['slime', 2261, 257, 34], ['crystal', 2358, 340, 1], ['drone', 2746, 340, 2], ['slime', 2900, 340, 45], ['crystal', 3285], ['wall', 3460, 340, 5], ['drone', 3546, 340, 2]),
    pickups: pickups([288, 228], [657, 207], [921, 193, 'shield'], [1120, 230], [1280, 197], [1505, 219], [1660, 183], [1808, 303, 'boots'], [2091, 207], [2312, 219], [2480, 229, 'shield'], [2650, 195], [2863, 210], [3017, 222], [3189, 201], [3416, 216]),
  },
];
