import { useId, useRef } from 'react';
import type { PauseDialog as PauseContent } from '../../core/store';
import { ArcadeDialog } from './ArcadeDialog';

export type { PauseContent };

export interface PauseDialogProps {
  /** AppState.dialog when kind === 'pause'; null keeps the dialog closed. */
  content: PauseContent | null;
  soundEnabled: boolean;
  /** Which button gets focus on open. Default 'resume'. */
  initialFocus?: 'resume' | 'garage';
  onResume: () => void;
  onHome: () => void;
  onGuide: () => void;
  onToggleSound: () => void;
}

export function PauseDialog({ content, soundEnabled, initialFocus = 'resume', onResume, onHome, onGuide, onToggleSound }: PauseDialogProps) {
  const id = useId();
  const resumeRef = useRef<HTMLButtonElement>(null);
  const garageRef = useRef<HTMLButtonElement>(null);
  return (
    <ArcadeDialog
      open={content !== null}
      labelledBy={`${id}-title`}
      describedBy={`${id}-detail`}
      initialFocusRef={initialFocus === 'garage' ? garageRef : resumeRef}
      onCancel={onResume}
    >
      <h2 id={`${id}-title`}>{content?.title ?? 'Paused'}</h2>
      <p id={`${id}-detail`}>{content?.detail}</p>
      <div className="dialog-actions">
        <button ref={resumeRef} type="button" className="primary-button" onClick={onResume}>
          Resume
        </button>
        <button ref={garageRef} type="button" className="back-button" onClick={onHome}>
          Garage
        </button>
      </div>
      <div className="pause-links">
        <button type="button" className="text-button" onClick={onGuide}>
          How to play
        </button>
        <button type="button" className="text-button" onClick={onToggleSound}>
          {soundEnabled ? 'Mute sound' : 'Unmute sound'}
        </button>
      </div>
    </ArcadeDialog>
  );
}
