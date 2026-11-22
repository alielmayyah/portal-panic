import { useLayoutEffect, useRef, type CSSProperties, type Ref } from 'react';
import type { LevelDef, Mode } from '../../core/types';
import type { Pilot } from '../../core/store';
import { menuIn } from '../anim';
import { HeaderTools, type HeaderToolsProps } from './Masthead';
import { scoreText } from './format';

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

export function GarageMenu(props: GarageMenuProps) {
  const { mode, pilot, levels, selectedLevel, unlocked, cleared, best, runs, previewRef, portraitRef, startRef, tools } = props;
  const rootRef = useRef<HTMLElement>(null);
  const versus = mode === 'versus';
  const level = levels[selectedLevel] ?? levels[0];
  const pilotName = PILOTS.find((p) => p.id === pilot)?.name ?? 'Rick';

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
          <div ref={previewRef} className="preview-stage" aria-hidden="true" />
          <div className="hero">
            <h1 id="title">
              PORTAL <span>PANIC</span>
              <i>.</i>
            </h1>
            <p>{levels.length} dimensions and two bosses stand between you and the garage.</p>
          </div>
          <p className="scene-label">
            <span>{level?.code}</span>
            <strong>{level?.name}</strong>
          </p>
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
            return (
              <button
                key={lvl.code + index}
                type="button"
                className="level-card"
                disabled={locked}
                aria-pressed={selected}
                aria-label={`Level ${index + 1}: ${lvl.name}, ${state}`}
                style={{ '--stage': lvl.rim, '--stage-bg': lvl.near } as CSSProperties}
                onClick={() => props.onLevelSelect(index)}
              >
                <span className="level-number">{pad2(index + 1)}</span>
                <strong>{lvl.short ?? lvl.name}</strong>
                <small>{selected ? (state === 'Cleared' ? 'Cleared' : 'Selected') : state}</small>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="launch-panel" aria-labelledby="playTitle">
        <div className="flex items-center justify-between gap-2">
          <h2 id="playTitle">Play</h2>
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
          <span aria-hidden="true">▶</span>
          <span>{versus ? 'Start race' : 'Start solo'}</span>
        </button>
        {props.onShop && (
          <button type="button" className="shop-button" onClick={props.onShop}>
            <i className="shop-coin" aria-hidden="true" />
            <span>Shop</span>
            {props.coins !== undefined && <b aria-label={`${props.coins} coins`}>{props.coins}</b>}
          </button>
        )}
        <p className="start-detail">{versus ? level?.name : `${pilotName} · ${level?.name}`}</p>

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
