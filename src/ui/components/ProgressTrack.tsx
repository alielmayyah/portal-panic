import type { CSSProperties } from 'react';
import type { RunnerHud } from '../../core/store';

export type ProgressRunner = Pick<RunnerHud, 'name' | 'color' | 'progress' | 'alive'>;

export interface ProgressTrackProps {
  /** HudSnapshot.runners (progress is 0..100 in half-percent steps). */
  runners: readonly ProgressRunner[];
  /** HudSnapshot.checkpointPct, 0..100. */
  checkpointPct: number;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/** START —●—◆— PORTAL bar along the bottom of the course. */
export function ProgressTrack({ runners, checkpointPct }: ProgressTrackProps) {
  return (
    <div className="race-progress" role="group" aria-label="Progress to the exit portal">
      <span aria-hidden="true">START</span>
      <div className="progress-track" style={{ '--checkpoint': `${clampPct(checkpointPct)}%` } as CSSProperties}>
        <i className="progress-checkpoint" aria-hidden="true" />
        {runners.map((runner, index) => {
          const percent = clampPct(runner.progress);
          return (
            <i
              key={runner.name + index}
              className={`progress-pilot${runner.alive ? '' : ' is-out'}`}
              role="meter"
              aria-label={`${runner.name}’s progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              style={{ '--pilot': runner.color, left: `${percent}%` } as CSSProperties}
            />
          );
        })}
      </div>
      <span aria-hidden="true">PORTAL</span>
    </div>
  );
}
