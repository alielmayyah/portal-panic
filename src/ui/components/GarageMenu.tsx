import { useLayoutEffect, useRef, type CSSProperties, type Ref } from 'react';
import type { LevelDef, Mode } from '../../core/types';
import type { Pilot } from '../../core/store';
import { menuIn } from '../anim';
import { HeaderTools, type HeaderToolsProps } from './Masthead';
import { scoreText } from './format';
import { MenuIcon } from './icons';
import dimensions from '../../assets/dimensions.webp?inline';

export type { Mode };
export type PilotId = Pilot;

/** The fields of a LevelDef (core/levels LEVELS) the garage shows; pass LEVELS directly. */
export type GarageLevel = Pick<LevelDef, 'name' | 'short' | 'code' | 'rim' | 'near'>;

export interface GarageMenuProps {
  mode: Mode;
  pilot: PilotId;
  levels: readonly GarageLevel[];
  /** Selected level index for the current mode. */
  selectedLevel: number;
  /** Highest unlocked solo level index. */
  unlocked: number;
  /** Number of solo levels cleared. */
  cleared: number;
  best: number;
  runs: number;
  /** Phaser preview scene mounts into this div. */
  previewRef?: Ref<HTMLDivElement>;
  previewOpen?: boolean;
  onPreviewToggle?: () => void;
  /** Called with each portrait canvas (and null on unmount) so a helper can draw the runner bust. */
  portraitRef?: (pilot: PilotId, canvas: HTMLCanvasElement | null) => void;
  /** Start button ref, so the app can focus it after returning from a run. */
  startRef?: Ref<HTMLButtonElement>;
  onModeChange: (mode: Mode) => void;
  onPilotChange: (pilot: PilotId) => void;
  onLevelSelect: (level: number) => void;
  onStart: () => void;
  /** Opens the gadget shop (screen 'shop'); the button is hidden without it. */
  onShop?: () => void;
  /** Banked coins shown on the Shop button. */
  coins?: number;
  /**
   * Optional header tools (How to play, sound, fullscreen). Pass them when the app does not render a
   * <Masthead> above the garage; they render in the launch panel heading row.
   */
  tools?: HeaderToolsProps;
}

const PILOTS: { id: PilotId; name: string }[] = [
  { id: 'rick', name: 'Rick' },
  { id: 'morty', name: 'Morty' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const LEVEL_ICON = { Locked: 'lock', Cleared: 'cleared', Selected: 'selected', Ready: 'ready' } as const;

export function GarageMenu(props: GarageMenuProps) {
  const { mode, pilot, levels, selectedLevel, unlocked, cleared, best, runs, previewRef, portraitRef, startRef, tools } = props;
  const rootRef = useRef<HTMLElement>(null);
  const versus = mode === 'versus';
  const level = levels[selectedLevel] ?? levels[0];

  useLayoutEffect(() => {
    const anim = menuIn(rootRef.current);
    return () => {
      anim?.revert();
    };
  }, []);

  const mapStatus = versus
    ? 'Choose any level to race.'
    : cleared >= levels.length
      ? 'All levels cleared.'
      : 'Clear a level to unlock the next.';

  return (
    <section ref={rootRef} className="launch-grid" aria-labelledby="title">
      <div className="cabinet">
        <div className="cabinet-window">
          {props.previewOpen && <div ref={previewRef} className="preview-stage" aria-hidden="true" />}
          <div className={props.previewOpen ? 'sr-only' : 'hero'}>
            <h1 id="title">Portal <span>Panic</span></h1>
            <p>{levels.length} dimensions and two bosses stand between you and the garage.</p>
          </div>
        </div>
        <div className="cabinet-caption">
          <p className="scene-label">
            <span>{level?.code}</span>
            <strong>{level?.name}</strong>
          </p>
          <button className="preview-button" type="button" aria-pressed={props.previewOpen} onClick={props.onPreviewToggle}>
            {props.previewOpen ? 'Show cover' : 'Preview level'} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>

      <section className="portal-map" aria-labelledby="mapTitle">
        <div className="map-header">
          <h2 id="mapTitle">Portal map</h2>
          <p>{mapStatus}</p>
        </div>
        <div className="level-options" role="group" aria-label="Starting level">
          {levels.map((lvl, index) => {
            const locked = !versus && index > unlocked;
            const state = locked ? 'Locked' : !versus && index < cleared ? 'Cleared' : 'Ready';
            const selected = index === selectedLevel;
            const status = selected && state === 'Ready' ? 'Selected' : state;
            return (
              <button
                key={lvl.code + index}
                type="button"
                className="level-card"
                disabled={locked}
                aria-pressed={selected}
                aria-label={`Level ${index + 1}: ${lvl.name}, ${state}`}
                style={{ '--stage': lvl.rim } as CSSProperties}
                onClick={() => props.onLevelSelect(index)}
              >
                <span className="level-art" aria-hidden="true" style={{
                  backgroundImage: `url(${dimensions})`,
                  backgroundPosition: `${(index % 2) * 100}% ${Math.floor(index / 2) * 100 / 3}%`,
                }} />
                <span className="level-number" aria-hidden="true">{pad2(index + 1)}</span>
                <span className="level-marker"><MenuIcon name={LEVEL_ICON[status]} /></span>
                <strong>{lvl.short ?? lvl.name}</strong>
                <small>{status}</small>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="launch-panel" aria-labelledby="playTitle">
        <div className="flex items-center justify-between gap-2">
          <h2 id="playTitle">Launch setup</h2>
          {tools && <HeaderTools {...tools} />}
        </div>
        <div className="mode-picker" role="group" aria-label="Game mode">
          <button type="button" aria-pressed={!versus} onClick={() => props.onModeChange('solo')}>
            Solo
          </button>
          <button type="button" aria-pressed={versus} onClick={() => props.onModeChange('versus')}>
            Local versus
          </button>
        </div>

        <fieldset className="pilot-select" hidden={versus}>
          <legend>Choose a runner</legend>
          <div className="pilot-options">
            {PILOTS.map(({ id, name }) => (
              <label key={id} className={`pilot pilot--${id}`}>
                <input
                  type="radio"
                  name="pilot"
                  value={id}
                  checked={pilot === id}
                  onChange={() => props.onPilotChange(id)}
                />
                <canvas
                  width={176}
                  height={208}
                  data-portrait={id}
                  aria-hidden="true"
                  ref={portraitRef ? (canvas) => portraitRef(id, canvas) : undefined}
                />
                <span>
                  <strong>{name}</strong>
                </span>
                <i aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="versus-info" hidden={!versus}>
          <div>
            <span>Player 1</span>
            <strong>Rick</strong>
          </div>
          <div>
            <span>Player 2</span>
            <strong>Morty</strong>
          </div>
          <p>First through the exit portal wins.</p>
        </div>

        <button ref={startRef} className="primary-button start-button" type="button" onClick={props.onStart}>
          <span>{versus ? 'Start race' : 'Start solo'}</span>
          <span aria-hidden="true">→</span>
        </button>
        {props.onShop && (
          <button type="button" className="shop-button" onClick={props.onShop}>
            <MenuIcon name="shop" />
            <span>Shop</span>
            {props.coins !== undefined && <b aria-label={`${props.coins} coins`}>{props.coins}</b>}
          </button>
        )}

        <div className="records" role="group" aria-label="Solo records on this device">
          <div>
            <small>PERSONAL BEST</small>
            <strong>{scoreText(best)}</strong>
          </div>
          <div>
            <small>SOLO RUNS</small>
            <strong>{runs}</strong>
          </div>
        </div>
      </aside>
    </section>
  );
}
