import { makeMonster } from './enemies';
import type { Floor, HazardDef, HazardType, LedgeDef, LevelDef, PickupDef, PickupKind } from './types';

export const GROUND_Y = 340;
export const PLATFORM_DEPTH = 18;

type Range = readonly [x: number, end: number];
type LedgeSpec = readonly [x: number, w: number, y: number, travel?: number];
type HazardSpec = readonly [type: HazardType, wx: number, floor?: number, variant?: number];
type PickupSpec = readonly [wx: number, y: number, kind?: PickupKind];

const ground = (...ranges: Range[]): Floor[] => ranges.map(([x, end]) => ({ x, w: end - x, y: GROUND_Y }));
const ledges = (...ranges: LedgeSpec[]): LedgeDef[] =>
  ranges.map(([x, w, y, travel = 0]) => ({ x, w, y, travel, phase: x * .013 }));

/** Builds one hazard the same way level data does (also handy for preview scenes). */
export function makeHazard(type: HazardType, wx: number, floor = GROUND_Y, variant = 0): HazardDef {
  if (type === 'wall') return { type, wx, w: 38, h: 244, y: floor - 244, hp: variant };
  if (type === 'drone') return { type, wx, w: 46, h: 28, y: floor - 83, phase: wx * .03, patrol: 36, lift: 25, volley: variant, hp: 2 };
  if (type === 'slime') return { type, wx, w: 52, h: 42, y: floor - 42, phase: wx * .03, patrol: variant, hp: 2 };
  return {
    type, wx, w: variant ? 54 : 29, h: variant ? 48 : 39, y: floor - (variant ? 48 : 39),
    shards: variant ? 2 : 1, tint: wx % 3 ? .21 : .75, hp: variant ? 2 : 1,
  };
}
const hazards = (...items: HazardSpec[]): HazardDef[] => items.map(([type, wx, floor, variant]) => makeHazard(type, wx, floor, variant));

/** Builds one pickup the same way level data does. */
export function makePickup(wx: number, y: number, kind: PickupKind = 'cell'): PickupDef {
  return { wx, y, kind, phase: wx * .07, r: kind === 'cell' ? 10 : 14 };
}
const pickups = (...items: PickupSpec[]): PickupDef[] => items.map(([wx, y, kind]) => makePickup(wx, y, kind));

export const LEVELS: readonly LevelDef[] = [
  {
    code: 'C-137', name: 'Alien Badlands', short: 'Badlands', width: 3030, checkpoint: 1470, exit: 2895,
    sky: '#250e39', haze: '#a94b81', far: '#653957', near: '#362042', dirt: '#2c1837', rim: '#d898ae', moon: '#f6b19c',
    skyline: 'ridges', glow: '#55315f', bass: [36, 36, 43, 36, 39, 39, 46, 43], beat: .272,
    floors: ground([0, 760], [865, 1640], [1770, 2370], [2510, 3030]),
    platforms: ledges([330, 150, 259], [583, 114, 246], [902, 145, 264], [1195, 116, 241], [1685, 125, 272], [2003, 127, 249], [2418, 120, 272], [2545, 134, 244]),
    hazards: hazards(['slime', 462, 340, 48], ['crystal', 623], ['crystal', 1016, 264], ['drone', 1263, 340, 1], ['wall', 1550, 340, 4], ['crystal', 1890, 340, 1], ['slime', 2146, 340, 57], ['drone', 2635], ['wall', 2740, 340, 4]),
    pickups: pickups([475, 222], [692, 304, 'shield'], [944, 216], [1374, 310], [1522, 300, 'boots'], [1697, 238], [2070, 214], [2435, 250], [2680, 210]),
  },
  {
    code: 'J-19ζ7', name: 'Cronenberg Wastes', short: 'Wastes', width: 3430, checkpoint: 1690, exit: 3280,
    sky: '#361026', haze: '#b6504f', far: '#7a3648', near: '#46203c', dirt: '#2f1729', rim: '#e1997b', moon: '#ffca7e',
    skyline: 'ridges', glow: '#d56070', bass: [33, 33, 40, 45, 36, 36, 43, 40], beat: .25,
    floors: ground([0, 640], [770, 1240], [1393, 1910], [2050, 2470], [2630, 3430]),
    platforms: ledges([274, 142, 250], [687, 108, 271], [814, 124, 237], [1020, 146, 265], [1290, 128, 267, 38], [1505, 107, 241], [1956, 128, 267], [2220, 120, 236], [2517, 145, 268, 32], [2862, 124, 262], [3070, 119, 228]),
    hazards: hazards(['slime', 415, 340, 56], ['wall', 547, 340, 5], ['drone', 921, 340, 1], ['crystal', 1095, 265, 1], ['slime', 1539, 340, 52], ['drone', 1790, 340, 1], ['crystal', 2170, 340, 1], ['wall', 2301, 340, 5], ['slime', 2390, 340, 23], ['crystal', 2720], ['drone', 3008, 340, 1], ['slime', 3150, 340, 29]),
    pickups: pickups([350, 211], [620, 239], [843, 202, 'shield'], [1164, 305], [1304, 225], [1615, 304], [1738, 305, 'boots'], [2040, 222], [2280, 195], [2494, 225], [2675, 208], [2914, 227, 'shield'], [3132, 194]),
  },
  {
    code: 'C-500A', name: 'The Citadel', short: 'Citadel', width: 3780, checkpoint: 1725, exit: 3615,
    sky: '#111c3b', haze: '#49699b', far: '#424a78', near: '#292c54', dirt: '#181b34', rim: '#a0aee1', moon: '#b7dbe8',
    skyline: 'towers', glow: '#55315f', bass: [42, 42, 49, 54, 38, 38, 45, 49], beat: .224,
    floors: ground([0, 570], [720, 1120], [1260, 1910], [2108, 2500], [2650, 3000], [3160, 3780]),
    platforms: ledges([231, 111, 262], [410, 79, 257], [618, 125, 259], [852, 144, 234], [1168, 123, 263, 35], [1432, 134, 254], [1608, 118, 222], [1962, 162, 274, 36], [2210, 149, 257], [2547, 130, 267, 34], [2808, 112, 250], [3048, 137, 267], [3360, 125, 253]),
    hazards: hazards(['crystal', 372, 340, 1], ['wall', 517, 340, 5], ['drone', 839, 340, 2], ['slime', 986, 340, 56], ['crystal', 1370], ['drone', 1488, 340, 2], ['wall', 1582, 340, 5], ['drone', 1803], ['slime', 2261, 257, 34], ['crystal', 2358, 340, 1], ['drone', 2746, 340, 2], ['slime', 2900, 340, 45], ['crystal', 3285], ['wall', 3460, 340, 5], ['drone', 3546, 340, 2]),
    pickups: pickups([288, 228], [657, 207], [921, 193, 'shield'], [1120, 230], [1280, 197], [1505, 219], [1660, 183], [1808, 303, 'boots'], [2091, 207], [2312, 219], [2480, 229, 'shield'], [2650, 195], [2863, 210], [3017, 222], [3189, 201], [3416, 216]),
  },
  // ---------- Wave 2: levels 4-8 (escalating; 4 = mid-boss, 8 = final boss) ----------
  {
    code: 'K-22β', name: 'Frozen Moon', short: 'Frost', width: 3600, checkpoint: 2430, exit: 3480,
    sky: '#0d1f3a', haze: '#5b8fb8', far: '#3e6489', near: '#223a5e', dirt: '#16263f', rim: '#bfe8ff', moon: '#e8f6ff',
    skyline: 'spires', glow: '#7fd3ff', bass: [38, 38, 45, 38, 41, 41, 48, 45], beat: .26,
    floors: ground([0, 700], [830, 1500], [1650, 2250], [2400, 2620], [2760, 3600]),
    platforms: ledges([300, 140, 262], [560, 110, 244], [740, 120, 268, 30], [1010, 130, 250], [1300, 120, 236], [1560, 120, 262, 34], [1800, 140, 250], [2080, 120, 232], [2300, 110, 262, 30], [2520, 130, 246], [2680, 110, 268]),
    hazards: [...hazards(['slime', 450, 340, 40], ['crystal', 640], ['drone', 960, 340, 1], ['crystal', 1050, 250, 1], ['crystal', 1250], ['wall', 1420, 340, 5], ['slime', 1900, 340, 50], ['drone', 1990, 340, 2], ['crystal', 2060], ['wall', 2190, 340, 5]), makeMonster('hopper', 1100), makeMonster('swooper', 1300), makeMonster('swooper', 1750), makeMonster('boss', 3150, 340, 0, 380)],
    pickups: pickups([370, 226], [600, 206], [780, 232, 'shield'], [1070, 214], [1340, 198], [1600, 226], [1760, 304, 'boots'], [1870, 212], [2120, 194, 'freeze'], [2340, 226], [2560, 210, 'shield'], [2700, 232], [3000, 300, 'rapid'], [3300, 300]),
  },
  {
    code: 'N-808', name: 'Neon Sprawl', short: 'Neon', width: 3900, checkpoint: 1880, exit: 3780,
    sky: '#120626', haze: '#7a2a9c', far: '#3a1a5e', near: '#221040', dirt: '#140a26', rim: '#ff6ad5', moon: '#7ff6ff',
    skyline: 'neon', glow: '#ff3fb4', bass: [40, 40, 47, 52, 43, 43, 50, 47], beat: .214,
    floors: ground([0, 620], [780, 1300], [1460, 1980], [2150, 2600], [2780, 3200], [3360, 3900]),
    platforms: ledges([260, 130, 256], [500, 120, 238], [660, 130, 262, 36], [900, 140, 248], [1160, 120, 230], [1340, 120, 258, 34], [1560, 130, 240], [1820, 120, 224], [2000, 130, 262, 38], [2260, 140, 246], [2480, 120, 228], [2640, 120, 258, 36], [2900, 130, 240], [3090, 110, 226], [3220, 120, 260, 34], [3500, 140, 246]),
    hazards: [...hazards(['crystal', 420, 340, 1], ['wall', 560, 340, 5], ['drone', 980, 340, 2], ['slime', 1100, 340, 50], ['crystal', 1200, 230], ['drone', 1640, 340, 2], ['wall', 1740, 340, 5], ['slime', 2300, 340, 60], ['crystal', 2540], ['drone', 2950, 340, 2], ['crystal', 3060, 340, 1], ['slime', 3500, 340, 40], ['wall', 3620, 340, 5]), makeMonster('spitter', 1250), makeMonster('brute', 1600, 340, 0, 80), makeMonster('swooper', 2250), makeMonster('hopper', 2400), makeMonster('hopper', 3000), makeMonster('spitter', 3420)],
    pickups: pickups([320, 220], [550, 202], [700, 226, 'turbo'], [960, 212], [1200, 194], [1380, 222, 'shield'], [1600, 204], [1860, 188], [2040, 226], [2200, 304, 'boots'], [2320, 210], [2520, 192, 'magnet'], [2690, 222], [2950, 204], [3130, 190, 'shield'], [3260, 224], [3560, 210, 'rapid']),
  },
  {
    code: 'T-4X9', name: 'Toxic Mire', short: 'Mire', width: 4100, checkpoint: 2160, exit: 3990,
    sky: '#0e1f14', haze: '#5d8a3a', far: '#355a2c', near: '#203a1e', dirt: '#142617', rim: '#c6f56a', moon: '#e9ff9a',
    skyline: 'swamp', glow: '#8dff4f', bass: [31, 31, 38, 43, 34, 34, 41, 38], beat: .232,
    floors: ground([0, 600], [760, 1240], [1420, 1900], [2090, 2520], [2700, 3150], [3340, 3640], [3820, 4100]),
    platforms: ledges([240, 140, 258], [470, 110, 240], [640, 120, 264, 38], [880, 130, 246], [1100, 120, 228], [1290, 110, 256, 40], [1520, 140, 242], [1760, 120, 224], [1960, 130, 262, 40], [2220, 130, 244], [2420, 110, 226], [2580, 120, 260, 40], [2840, 130, 240], [3040, 120, 222], [3210, 120, 258, 42], [3420, 120, 236], [3690, 120, 260, 42], [3900, 120, 240]),
    hazards: [...hazards(['slime', 380, 340, 40], ['crystal', 540, 340, 1], ['drone', 900, 340, 2], ['wall', 1180, 340, 6], ['slime', 1600, 340, 45], ['crystal', 1820], ['drone', 2000, 340, 2], ['slime', 2300, 340, 50], ['crystal', 2460, 340, 1], ['wall', 2800, 340, 6], ['drone', 3000, 340, 2], ['slime', 3500, 340, 40], ['drone', 3870, 340, 2]), makeMonster('splitter', 1000), makeMonster('hopper', 1700), makeMonster('spitter', 2270), makeMonster('brute', 2410, 340, 0, 50), makeMonster('splitter', 2950), makeMonster('swooper', 3250), makeMonster('hopper', 3480, 340, 0, 100)],
    pickups: pickups([300, 222], [510, 204], [680, 228, 'ghost'], [930, 210], [1140, 192], [1330, 220, 'shield'], [1580, 206], [1800, 188], [2000, 226, 'boots'], [2270, 208], [2460, 190], [2620, 224, 'giant'], [2890, 204], [3080, 186], [3250, 222, 'shield'], [3470, 200], [3730, 224, 'magnet'], [3950, 204]),
  },
  {
    code: 'S-9Ω', name: 'Sky Islands', short: 'Isles', width: 4300, checkpoint: 1960, exit: 4180,
    sky: '#1b2f6b', haze: '#e39a7a', far: '#5a6fb0', near: '#38427e', dirt: '#2a2850', rim: '#ffe0a8', moon: '#fff4d6',
    skyline: 'islands', glow: '#ffb86b', bass: [43, 43, 50, 55, 45, 45, 52, 50], beat: .205,
    floors: ground([0, 560], [750, 1100], [1300, 1700], [1910, 2150], [2560, 2900], [3100, 3460], [3660, 4300]),
    platforms: ledges([220, 130, 256], [440, 110, 236], [610, 110, 262, 40], [860, 130, 244], [1150, 110, 258, 42], [1380, 130, 240], [1580, 110, 222], [1760, 110, 256, 44], [2000, 120, 238], [2230, 120, 280], [2400, 110, 260, 30], [2650, 120, 240], [2960, 110, 258, 44], [3200, 130, 238], [3400, 110, 220], [3520, 110, 256, 44], [3800, 140, 244]),
    hazards: [...hazards(['drone', 500, 340, 2], ['crystal', 1000, 340, 1], ['slime', 1500, 340, 40], ['wall', 1640, 340, 6], ['crystal', 2040, 238], ['drone', 2300, 340, 2], ['slime', 2700, 340, 50], ['crystal', 2860], ['drone', 3250, 340, 2], ['wall', 3420, 340, 6], ['slime', 3900, 340, 60], ['drone', 4050, 340, 2]), makeMonster('swooper', 640), makeMonster('hopper', 880, 340, 0, 100), makeMonster('swooper', 1200), makeMonster('brute', 1450, 340, 0, 100), makeMonster('spitter', 2050, 340, 1), makeMonster('swooper', 2350), makeMonster('splitter', 2650, 340, 0, 60), makeMonster('spitter', 3350), makeMonster('brute', 3950, 340, 0, 80)],
    pickups: pickups([280, 220], [480, 200], [650, 226, 'turbo'], [910, 208], [1190, 222, 'shield'], [1430, 204], [1620, 186], [1800, 220, 'boots'], [2050, 202], [2280, 244], [2440, 224, 'ghost'], [2700, 204], [3000, 222, 'shield'], [3250, 202], [3440, 184], [3560, 220, 'freeze'], [3860, 208]),
  },
  {
    code: 'Ω-0', name: 'The Maw', short: 'Maw', width: 4200, checkpoint: 2900, exit: 4080,
    sky: '#1a0608', haze: '#a8321e', far: '#5a1a18', near: '#341012', dirt: '#200a0c', rim: '#ff8a5c', moon: '#ffcf7a',
    skyline: 'lair', glow: '#ff4a1f', bass: [29, 29, 36, 29, 32, 32, 39, 36], beat: .2,
    floors: ground([0, 620], [800, 1300], [1490, 1980], [2170, 2560], [2760, 4200]),
    platforms: ledges([260, 130, 252], [500, 110, 234], [680, 110, 262, 40], [920, 130, 244], [1150, 110, 226], [1360, 110, 258, 40], [1600, 130, 240], [1830, 110, 222], [2040, 110, 258, 42], [2290, 130, 240], [2460, 110, 224], [2630, 110, 258, 40], [2950, 130, 250], [3300, 140, 236, 30], [3700, 140, 236, 30]),
    hazards: [...hazards(['crystal', 420, 340, 1], ['drone', 560, 340, 2], ['slime', 900, 340, 55], ['wall', 1100, 340, 6], ['crystal', 1200, 226, 1], ['drone', 1450, 340, 2], ['slime', 1700, 340, 60], ['crystal', 1940], ['drone', 2350, 340, 2], ['wall', 2500, 340, 7]), makeMonster('spitter', 1250, 340, 1), makeMonster('swooper', 1400, 340, 1), makeMonster('hopper', 1700, 340, 0, 120), makeMonster('brute', 2300, 340, 0, 100), makeMonster('swooper', 2550, 340, 1), makeMonster('splitter', 3060, 340, 0, 60), makeMonster('boss', 3700, 340, 1, 460)],
    pickups: pickups([320, 216], [540, 198], [720, 226, 'shield'], [970, 208], [1190, 190, 'rapid'], [1400, 222], [1650, 204], [1870, 186, 'boots'], [2080, 222], [2340, 204], [2500, 188, 'shield'], [2670, 222], [3000, 214, 'giant'], [3360, 200, 'shield'], [3760, 200, 'freeze']),
  },
];
