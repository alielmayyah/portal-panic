import { useId, useRef, type CSSProperties } from 'react';
import type { ResultDialog as ResultContent, ResultStat } from '../../core/store';
import { ArcadeDialog } from './ArcadeDialog';
import { scoreText } from './format';

export type { ResultContent, ResultStat };

export interface ResultDialogProps {
  /** AppState.dialog when kind === 'result'; null keeps the dialog closed. */
  content: ResultContent | null;
  /** Which button gets focus on open. Default 'retry'. */
  initialFocus?: 'retry' | 'garage';
  onRetry: () => void;
  /** Garage button, Android back, or the browser closing the dialog on its own. */
  onHome: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ResultDialog({ content, initialFocus = 'retry', onRetry, onHome }: ResultDialogProps) {
  const id = useId();
  const retryRef = useRef<HTMLButtonElement>(null);
  const garageRef = useRef<HTMLButtonElement>(null);
  return (
    <ArcadeDialog
      open={content !== null}
      labelledBy={`${id}-title`}
      describedBy={content?.tag ? `${id}-tag ${id}-detail` : `${id}-detail`}
      initialFocusRef={initialFocus === 'garage' ? garageRef : retryRef}
      focusKey={content}
      blockEscape
      onDismiss={onHome}
    >
      {content && (
        <>
          {content.tag && (
            <p className="result-tag" id={`${id}-tag`}>
              {content.tag}
            </p>
          )}
          <h2 id={`${id}-title`}>{content.title}</h2>
          <p id={`${id}-detail`}>{content.detail}</p>
          <div className="result-stats">
            {content.stats.map((runner, index) => (
              <div key={runner.name + index} style={{ '--pilot': runner.color } as CSSProperties}>
                <small>{`${runner.name}’s score`}</small>
                <strong>{scoreText(runner.score)}</strong>
                <span>
                  {plural(runner.kills, 'hazard', 'hazards')} cleared · {plural(runner.walls, 'wall', 'walls')} broken
                </span>
              </div>
            ))}
          </div>
          <div className="dialog-actions">
            <button ref={retryRef} type="button" className="primary-button" onClick={onRetry}>
              {content.retryLabel}
            </button>
            <button ref={garageRef} type="button" className="back-button" onClick={onHome}>
              Garage
            </button>
          </div>
        </>
      )}
    </ArcadeDialog>
  );
}
