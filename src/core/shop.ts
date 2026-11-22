// Shop data and rules: wallet, owned weapons, per-pilot equipped weapon and upgrades. Pure functions over a
// ShopState plus validated localStorage load/save (portal:coins, portal:weapons, portal:equipped, portal:upgrades).
// store.ts holds the live state and exposes buyWeapon / equip / buyUpgrade / addCoins.
import { count, read, write } from './storage';
import type { Character } from './types';
import { BASE_MAX_MISSILES, MAX_MISSILE_CAP, WEAPONS, WEAPON_IDS, isWeaponId, type Loadout, type WeaponId } from './weapons';

export const SHOP_KEYS = {
  coins: 'portal:coins',
  weapons: 'portal:weapons',
  equipped: 'portal:equipped',
  upgrades: 'portal:upgrades',
} as const;

export type UpgradeId = 'missile-cap' | 'start-shield';

export interface Upgrades {
  /** Extra missile capacity bought (0..3: capacity 5..8). */
  missileCap: number;
  /** Start every level with a phase shield. */
  startShield: boolean;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Price of each level, in order; its length is the max level. */
  prices: readonly number[];
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>> = {
  'missile-cap': { id: 'missile-cap', name: 'Missile rack', blurb: 'Carry one more missile (up to 8).', prices: [150, 220, 300] },
  'start-shield': { id: 'start-shield', name: 'Pocket shield', blurb: 'Start every level with a phase shield.', prices: [260] },
};
export const UPGRADE_IDS: readonly UpgradeId[] = ['missile-cap', 'start-shield'];

export interface ShopState {
  coins: number;
  /** Owned weapons in shop order; always includes 'blaster'. */
  ownedWeapons: WeaponId[];
  equipped: Record<Character, WeaponId>;
  upgrades: Upgrades;
}

export const DEFAULT_SHOP: Readonly<ShopState> = {
  coins: 0,
  ownedWeapons: ['blaster'],
  equipped: { rick: 'blaster', morty: 'blaster' },
  upgrades: { missileCap: 0, startShield: false },
};

const sortOwned = (ids: readonly WeaponId[]): WeaponId[] => WEAPON_IDS.filter((id) => id === 'blaster' || ids.includes(id));

/** Validates any stored or merged shop data. */
export function normalizeShop(raw: { coins?: unknown; ownedWeapons?: unknown; equipped?: unknown; upgrades?: unknown }): ShopState {
  const owned = sortOwned(Array.isArray(raw.ownedWeapons) ? raw.ownedWeapons.filter(isWeaponId) : []);
  const eq = (raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {}) as Record<string, unknown>;
  const pick = (value: unknown): WeaponId => (isWeaponId(value) && owned.includes(value) ? value : 'blaster');
  const up = (raw.upgrades && typeof raw.upgrades === 'object' ? raw.upgrades : {}) as Record<string, unknown>;
  return {
    coins: count(raw.coins),
    ownedWeapons: owned,
    equipped: { rick: pick(eq.rick), morty: pick(eq.morty) },
    upgrades: {
      missileCap: Math.min(UPGRADES['missile-cap'].prices.length, count(up.missileCap)),
      startShield: up.startShield === true,
    },
  };
}

export function loadShop(): ShopState {
  return normalizeShop({
    coins: read<unknown>(SHOP_KEYS.coins, 0),
    ownedWeapons: read<unknown>(SHOP_KEYS.weapons, []),
    equipped: read<unknown>(SHOP_KEYS.equipped, {}),
    upgrades: read<unknown>(SHOP_KEYS.upgrades, {}),
  });
}

export function saveShop(state: ShopState): void {
  write(SHOP_KEYS.coins, state.coins);
  write(SHOP_KEYS.weapons, state.ownedWeapons);
  write(SHOP_KEYS.equipped, state.equipped);
  write(SHOP_KEYS.upgrades, state.upgrades);
}

// ---------- Rules (pure; null = not allowed) ----------

export const upgradeLevel = (state: ShopState, id: UpgradeId): number =>
  id === 'missile-cap' ? state.upgrades.missileCap : Number(state.upgrades.startShield);

/** Price of the next level of an upgrade, or null when it is maxed. */
export function upgradePrice(state: ShopState, id: UpgradeId): number | null {
  return UPGRADES[id].prices[upgradeLevel(state, id)] ?? null;
}

export function canBuyWeapon(state: ShopState, id: WeaponId): boolean {
  return !state.ownedWeapons.includes(id) && state.coins >= WEAPONS[id].price;
}

/** Buys a weapon (and equips it for `equipFor`, when given). */
export function buyWeapon(state: ShopState, id: WeaponId, equipFor?: Character): ShopState | null {
  if (!isWeaponId(id) || !canBuyWeapon(state, id)) return null;
  const next: ShopState = { ...state, coins: state.coins - WEAPONS[id].price, ownedWeapons: sortOwned([...state.ownedWeapons, id]) };
  return equipFor ? { ...next, equipped: { ...next.equipped, [equipFor]: id } } : next;
}

export function equipWeapon(state: ShopState, pilot: Character, id: WeaponId): ShopState | null {
  if (!state.ownedWeapons.includes(id)) return null;
  if (state.equipped[pilot] === id) return state;
  return { ...state, equipped: { ...state.equipped, [pilot]: id } };
}

export function buyUpgrade(state: ShopState, id: UpgradeId): ShopState | null {
  const price = upgradePrice(state, id);
  if (price == null || state.coins < price) return null;
  const upgrades = id === 'missile-cap'
    ? { ...state.upgrades, missileCap: state.upgrades.missileCap + 1 }
    : { ...state.upgrades, startShield: true };
  return { ...state, coins: state.coins - price, upgrades };
}

export function addCoins(state: ShopState, amount: number): ShopState {
  const n = count(amount);
  return n ? { ...state, coins: state.coins + n } : state;
}

/** The loadout a pilot takes into a run: every owned weapon (swap cycles in shop order), starting on the equipped one. */
export function loadoutFor(state: ShopState, pilot: Character): Loadout {
  const equipped = state.ownedWeapons.includes(state.equipped[pilot]) ? state.equipped[pilot] : 'blaster';
  return {
    weapons: [...state.ownedWeapons],
    equipped,
    maxMissiles: Math.min(MAX_MISSILE_CAP, BASE_MAX_MISSILES + state.upgrades.missileCap),
    startShield: state.upgrades.startShield,
  };
}
