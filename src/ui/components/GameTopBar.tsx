import { FullscreenIcon, PauseIcon, SoundIcon } from './icons';

export interface GameTopBarProps {
  /** Zero-based level index. */
  level: number;
  levelCount: number;
  levelCode: string;
  levelName: string;
  /** Pause is only usable while the phase is 'running'. */
  pauseDisabled: boolean;
  fullscreen: boolean;
  soundEnabled: boolean;
  /** Hide the sound button when the masthead already shows one. Default true. */
  showSound?: boolean;
  onHome: () => void;
  onPause: () => void;
  onToggleFullscreen: () => void;
  onToggleSound: () => void;
}

export function GameTopBar(props: GameTopBarProps) {
  const { level, levelCount, levelCode, levelName, pauseDisabled, fullscreen, soundEnabled, showSound = true } = props;
  return (
    <div className="game-top">
      <button type="button" className="back-button" onClick={props.onHome}>
        <span aria-hidden="true">←</span> Garage
      </button>
      <div className="game-location">
        <span>{`LEVEL ${level + 1} / ${levelCount} · ${levelCode}`}</span>
        <strong>{levelName}</strong>
      </div>
      <div className="game-tools">
        <button
          type="button"
          className={`fullscreen-button${fullscreen ? ' is-active' : ''}`}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-keyshortcuts="V"
          title={fullscreen ? 'Exit fullscreen (V)' : 'Fullscreen (V)'}
          onClick={props.onToggleFullscreen}
        >
          <FullscreenIcon active={fullscreen} />
          <span>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
        </button>
        {showSound && (
          <button
            type="button"
            className="icon-button"
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            aria-keyshortcuts="M"
            title="Toggle sound (M)"
            onClick={props.onToggleSound}
          >
            <SoundIcon muted={!soundEnabled} />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Pause"
          aria-keyshortcuts="P"
          title="Pause (P)"
          disabled={pauseDisabled}
          onClick={props.onPause}
        >
          <PauseIcon />
        </button>
      </div>
    </div>
  );
}
