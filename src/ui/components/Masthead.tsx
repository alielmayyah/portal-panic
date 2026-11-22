import { BrandMark, FullscreenIcon, SoundIcon } from './icons';

export interface HeaderToolsProps {
  soundEnabled: boolean;
  fullscreen: boolean;
  /** The "?" guide button is hidden while a run is on screen (as in the old layout). */
  showGuide?: boolean;
  onGuide: () => void;
  onToggleSound: () => void;
  onToggleFullscreen: () => void;
}

/** How to play, sound and fullscreen buttons (top right of the masthead). */
export function HeaderTools({ soundEnabled, fullscreen, showGuide = true, onGuide, onToggleSound, onToggleFullscreen }: HeaderToolsProps) {
  return (
    <div className="header-tools">
      {showGuide && (
        <button className="icon-button help-button" type="button" aria-label="How to play" title="How to play" onClick={onGuide}>
          ?
        </button>
      )}
      <button
        className="icon-button"
        type="button"
        aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
        aria-keyshortcuts="M"
        title="Toggle sound (M)"
        onClick={onToggleSound}
      >
        <SoundIcon muted={!soundEnabled} />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-keyshortcuts="V"
        title={fullscreen ? 'Exit fullscreen (V)' : 'Fullscreen (V)'}
        onClick={onToggleFullscreen}
      >
        <FullscreenIcon active={fullscreen} />
      </button>
    </div>
  );
}

export interface MastheadProps extends HeaderToolsProps {
  onHome: () => void;
}

/** Brand button plus header tools; shared by the garage and game screens. */
export function Masthead({ onHome, ...tools }: MastheadProps) {
  return (
    <header className="masthead">
      <button type="button" className="brand" aria-label="Portal Panic Interdimensional Arcade, home" onClick={onHome}>
        <span className="brand-mark" aria-hidden="true">
          <BrandMark />
        </span>
        <span>
          <strong>PORTAL PANIC</strong>
          <small>INTERDIMENSIONAL ARCADE</small>
        </span>
      </button>
      <HeaderTools {...tools} />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>
        PORTAL PANIC <b>//</b> AN UNOFFICIAL FAN GAME
      </span>
    </footer>
  );
}
