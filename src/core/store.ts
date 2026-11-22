// React <-> Phaser bridge: a tiny typed store (use with React's useSyncExternalStore) and a typed event bus.
// The store holds app/garage state and HUD snapshots; the bus carries commands and game events.
import { LEVELS } from './levels';
import { KEYS, clampLevel, count, loadRecords, read, write } from './storage';
import type { Action, Character, CheatResult, DeathCause, Mode, WorldEventType } from './types';
import * as shop from './shop';
import type { ShopState, UpgradeId, Upgrades } from './shop';
import type { WeaponId } from './weapons';

// ---------- Store types ----------

export type Screen = 'menu' | 'game' | 'shop';
export type Pilot = Character;
export type SessionPhase = 'ready' | 'running' | 'paused' | 'crossing' | 'over';

export interface RunnerHud {
  name: string;
  color: string;
  character: Character;
  score: number;
  missiles: number;
  maxMissiles: number;
  shield: boolean;
  /** Seconds of gravity boots left (0 = none). */
  bootsSeconds: number;
  /** Gadget status text, '' when none (e.g. 'Shield ready', 'Double jump 7s', 'Respawning…'). */
  gadget: string;
  /** 0..100 in half-percent steps, from start to the exit portal. */
  progress: number;
  alive: boolean;
  god: boolean;
  infiniteAmmo: boolean;
  /** Weapons (weapons.ts): held weapon name and id, coins earned this run, Nova charge 0..1. */
  weapon?: string;
  weaponId?: WeaponId;
  coins?: number;
  charge?: number;
}

/** HUD snapshot pushed by the Phaser GameScene, at most once per frame and only when it changed. */
export interface HudSnapshot {
  phase: SessionPhase;
  mode: Mode;
  /** Level index (0-based). */
  level: number;
  levelCount: number;
  levelCode: string;
  levelName: string;
  /** Checkpoint position on the progress track, 0..100. */
  checkpointPct: number;
  /** Solo runner reached the checkpoint. */
  checkpointReached: boolean;
  runners: RunnerHud[];
  /** Any cheat was used this session (show the CHEATS tag; best/runs are not saved). */
  cheats: boolean;
  /** Boss HP bar: bossHud(world) from core/enemies.ts (null when no fight is on). */
  boss?: import('./enemies').BossHud | null;
}

export interface Toast {
  /** Increments for every toast so a repeated text still re-animates and re-announces. */
  id: number;
  text: string;
}

export interface ResultStat {
  name: string;
  color: string;
  score: number;
  kills: number;
  walls: number;
}

export interface PauseDialog {
  kind: 'pause';
  title: string;
  /** e.g. 'Alien Badlands · Checkpoint reached' */
  detail: string;
}

export interface ResultDialog {
  kind: 'result';
  /** e.g. 'NEW PERSONAL BEST', or null. */
  tag: string | null;
  title: string;
  detail: string;
  /** Primary button label: 'Rematch' | 'Play again' | 'Retry from checkpoint' | 'Retry level'. */
  retryLabel: string;
  completed: boolean;
  cause: DeathCause | null;
  stats: ResultStat[];
}

export type DialogContent = PauseDialog | ResultDialog;

export interface Countdown {
  kind: 'ready' | 'crossing';
  /** Small line, e.g. 'LEVEL 1', 'RACE TO THE PORTAL', 'ENTERING'. */
  label: string;
  /** Big line, e.g. 'READY', '3', '2', '1', or the next level name. */
  text: string;
}

export interface AppState {
  screen: Screen;
  mode: Mode;
  pilot: Pilot;
  selectedLevels: Record<Mode, number>;
  /** Highest unlocked solo level index. */
  unlocked: number;
  /** Solo levels cleared (0..LEVELS.length). */
  cleared: number;
  best: number;
  runs: number;
  soundEnabled: boolean;
  fullscreen: boolean;
  /** HUD snapshot of the current run, null on the menu. */
  session: HudSnapshot | null;
  message: Toast | null;
  dialog: DialogContent | null;
  countdown: Countdown | null;
  /** Shop (shop.ts): banked coins, owned weapons, equipped weapon per pilot, upgrades. Persisted. */
  coins: number;
  ownedWeapons: WeaponId[];
  equipped: Record<Pilot, WeaponId>;
  upgrades: Upgrades;
}

// ---------- Store ----------

export type Listener = () => void;

export interface Store<T> {
  getState(): T;
  /** Shallow-merges a patch (or the result of an updater). Listeners run only when something changed. */
  setState(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const key in next) {
        if (!Object.is(next[key], state[key])) { changed = true; break; }
      }
      if (!changed) return;
      state = { ...state, ...next };
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function initialAppState(): AppState {
  const records = loadRecords();
  return {
    screen: 'menu',
    mode: records.mode,
    pilot: records.pilot,
    selectedLevels: records.selectedLevels,
    unlocked: records.unlocked,
    cleared: records.cleared,
    best: records.best,
    runs: records.runs,
    soundEnabled: records.soundEnabled,
    fullscreen: false,
    session: null,
    message: null,
    dialog: null,
    countdown: null,
    ...shop.loadShop(),
  };
}

export const store: Store<AppState> = createStore(initialAppState());

// ---------- Actions (state + persistence, mirroring the old main.js) ----------

let toastId = 0;

export const actions = {
  setMode(mode: Mode): void {
    write(KEYS.mode, mode);
    store.setState({ mode });
  },
  setPilot(pilot: Pilot): void {
    write(KEYS.pilot, pilot);
    store.setState({ pilot });
  },
  selectLevel(mode: Mode, level: number): void {
    const value = clampLevel(level);
    write(mode === 'solo' ? KEYS.soloLevel : KEYS.versusLevel, value);
    store.setState((s) => ({ selectedLevels: { ...s.selectedLevels, [mode]: value } }));
  },
  setSoundEnabled(soundEnabled: boolean): void {
    write(KEYS.sound, soundEnabled);
    store.setState({ soundEnabled });
  },
  setFullscreen(fullscreen: boolean): void { store.setState({ fullscreen }); },
  /** Shows the race toast (UI also announces it in the live region). */
  notify(text: string): void { store.setState({ message: { id: ++toastId, text } }); },
  clearMessage(): void { store.setState({ message: null }); },
  /**
   * Saves a solo score as the personal best when it beats the stored one (merging with other tabs).
   * Returns true for a new best. Never saves when cheats were used.
   */
  bankBest(score: number, cheatsUsed: boolean): boolean {
    const best = Math.max(store.getState().best, count(read(KEYS.best, 0)));
    if (cheatsUsed || score <= best) { store.setState({ best }); return false; }
    write(KEYS.best, score);
    store.setState({ best: score });
    return true;
  },
  /** Counts a finished solo run (not with cheats). */
  recordRun(cheatsUsed: boolean): void {
    const runs = Math.max(store.getState().runs, count(read(KEYS.runs, 0))) + (cheatsUsed ? 0 : 1);
    if (!cheatsUsed) write(KEYS.runs, runs);
    store.setState({ runs });
  },
  /** Solo level `level` was cleared: marks it cleared and unlocks the next one. */
  recordCleared(level: number): void {
    const s = store.getState();
    const cleared = Math.min(LEVELS.length, Math.max(s.cleared, count(read(KEYS.cleared, 0)), level + 1));
    write(KEYS.cleared, cleared);
    const unlocked = Math.max(s.unlocked, clampLevel(read(KEYS.unlocked, 0)), clampLevel(level + 1));
    write(KEYS.unlocked, unlocked);
    store.setState({ cleared, unlocked });
  },
  /** UNLOCKALL cheat and the menu Konami code. */
  unlockAll(): void {
    const unlocked = LEVELS.length - 1;
    write(KEYS.unlocked, unlocked);
    store.setState({ unlocked });
  },
  /** Merge records written by other tabs (call from a window 'storage' listener). Values only go up. */
  syncFromStorage(): void {
    const s = store.getState();
    const unlocked = Math.max(s.unlocked, clampLevel(read(KEYS.unlocked, 0)));
    store.setState({
      best: Math.max(s.best, count(read(KEYS.best, 0))),
      runs: Math.max(s.runs, count(read(KEYS.runs, 0))),
      unlocked,
      cleared: Math.min(LEVELS.length, Math.max(s.cleared, unlocked, count(read(KEYS.cleared, 0)))),
      ...shop.loadShop(),
    });
  },
  // ---------- Shop (rules in shop.ts) ----------
  openShop(): void { store.setState({ screen: 'shop' }); },
  closeShop(): void { if (store.getState().screen === 'shop') store.setState({ screen: 'menu' }); },
  /** Buys a weapon (equipping it for `equipFor` when given). False when owned or too expensive. */
  buyWeapon(id: WeaponId, equipFor?: Pilot): boolean { return commitShop(shop.buyWeapon(shopState(), id, equipFor)); },
  /** Equips an owned weapon for a pilot (solo pilot, or Rick = P1 / Morty = P2 in versus). */
  equip(pilot: Pilot, id: WeaponId): boolean { return commitShop(shop.equipWeapon(shopState(), pilot, id)); },
  buyUpgrade(id: UpgradeId): boolean { return commitShop(shop.buyUpgrade(shopState(), id)); },
  /** Banks coins earned in a run. */
  addCoins(amount: number): void { commitShop(shop.addCoins(shopState(), amount)); },
};

/** The shop slice of the app state. */
export function shopState(s: AppState = store.getState()): ShopState {
  return { coins: s.coins, ownedWeapons: s.ownedWeapons, equipped: s.equipped, upgrades: s.upgrades };
}

function commitShop(next: ShopState | null): boolean {
  if (!next) return false;
  shop.saveShop(next);
  store.setState(next);
  return true;
}

// ---------- Bus ----------

export interface StartCommand { mode: Mode; level: number; pilot: Pilot }
export interface CheatCommand { code: string }
export interface TouchCommand {
  runner: number;
  action: Action;
  /** Pointer id (or any unique source id) so several fingers can hold the same button. */
  id: number;
}

/** A World event forwarded to React (runner reduced to plain data). */
export interface GameEventMessage {
  type: WorldEventType;
  /** Index into world.runners, or null. */
  runner: number | null;
  runnerName: string | null;
  versus: boolean;
}

export interface FinishPayload {
  mode: Mode;
  /** true: cleared the last solo level, or a versus race ended at the portal. */
  completed: boolean;
  cause: DeathCause | null;
  level: number;
  scores: number[];
  /** Winner index in versus, null for a photo finish or solo. */
  winner: number | null;
  cheatsUsed: boolean;
  newBest: boolean;
}

export interface PortalEnterPayload {
  mode: Mode;
  /** Level just cleared. */
  level: number;
  /** Next level index, or null when the run ends here. */
  nextLevel: number | null;
  winner: number | null;
  cheatsUsed: boolean;
}

export interface BusEvents {
  // React -> Phaser
  start: StartCommand;
  pause: void;
  resume: void;
  retry: void;
  home: void;
  cheat: CheatCommand;
  'touch-press': TouchCommand;
  'touch-release': TouchCommand;
  // Phaser -> React
  'cheat-result': CheatResult;
  'game-event': GameEventMessage;
  finish: FinishPayload;
  'portal-enter': PortalEnterPayload;
}

export type BusEventName = keyof BusEvents;
export type BusHandler<K extends BusEventName> = (payload: BusEvents[K]) => void;
type BusArgs<K extends BusEventName> = BusEvents[K] extends void ? [] : [payload: BusEvents[K]];

export interface Bus {
  emit<K extends BusEventName>(type: K, ...args: BusArgs<K>): void;
  /** Returns an unsubscribe function. */
  on<K extends BusEventName>(type: K, handler: BusHandler<K>): () => void;
  off<K extends BusEventName>(type: K, handler: BusHandler<K>): void;
}

export function createBus(): Bus {
  const handlers = new Map<BusEventName, Set<(payload: unknown) => void>>();
  const bus: Bus = {
    emit(type, ...args) {
      const set = handlers.get(type);
      if (!set) return;
      for (const handler of [...set]) handler(args[0]);
    },
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(handler as (payload: unknown) => void);
      return () => bus.off(type, handler);
    },
    off(type, handler) {
      handlers.get(type)?.delete(handler as (payload: unknown) => void);
    },
  };
  return bus;
}

export const bus: Bus = createBus();
