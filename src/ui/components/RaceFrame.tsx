import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';

export interface RaceFrameProps {
  /** <RunnerHud> */
  hud: ReactNode;
  /** The Phaser game mounts into this div (sized like the old 960x420 #track canvas). */
  stageRef?: Ref<HTMLDivElement>;
  /** Overlays inside the course window: <RaceToast>, <ProgressTrack>, <Countdown>, <CheatConsole>. */
  children?: ReactNode;
  /** Key legend under the course (usually <ControlsList>); hidden on touch screens. */
  legend?: ReactNode;
  /** Tap on the course (solo: jump). The app forwards it to the touch-press bus event. */
  onStagePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

/** Bordered frame: HUD strip, course window with overlays, key legend. */
export function RaceFrame({ hud, stageRef, children, legend, onStagePointerDown }: RaceFrameProps) {
  return (
    <div className="race-frame">
      {hud}
      <div className="race-window" onContextMenu={(event) => event.preventDefault()}>
        <div
          ref={stageRef}
          className="race-stage"
          tabIndex={-1}
          role="img"
          aria-label="Side-scrolling course"
          onPointerDown={onStagePointerDown}
        />
        {children}
      </div>
      {legend !== undefined && <div className="race-legend">{legend}</div>}
    </div>
  );
}
