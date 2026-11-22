import { useId, useRef } from 'react';
import { ArcadeDialog } from './ArcadeDialog';
import { CHEATS, type CheatInfo } from '../../core/cheats';
import type { ControlScheme } from '../../core/input';
import { ControlsList } from './ControlsList';

/** core/cheats CheatInfo {code, description}. */
export type CheatEntry = Pick<CheatInfo, 'description'> & { code: string };

export interface GuideDialogProps {
  open: boolean;
  /** CONTROL_SCHEMES[session mode ?? garage mode] from core/input. */
  scheme: readonly ControlScheme[];
  keyName?: (code: string) => string;
  /** Defaults to core/cheats CHEATS. */
  cheats?: readonly CheatEntry[];
  /** Show the cheat codes section. Default true. */
  showCheats?: boolean;
  onClose: () => void;
}

export function GuideDialog({ open, scheme, keyName, cheats = CHEATS, showCheats = true, onClose }: GuideDialogProps) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <ArcadeDialog
      open={open}
      className="guide-dialog"
      labelledBy={`${id}-title`}
      initialFocusRef={closeRef}
      armDelay={0}
      onCancel={onClose}
    >
      <div className="guide-top">
        <h2 id={`${id}-title`}>How to play</h2>
        <button ref={closeRef} type="button" className="icon-button" aria-label="Close how to play" onClick={onClose}>
          ×
        </button>
      </div>
      <p>Break cracked walls and reach the green exit portal. Watch for the red line before sentry drones fire.</p>
      <div className="guide-controls">
        <ControlsList scheme={scheme} keyName={keyName} />
      </div>
      <p className="touch-hint">
        Hold the blaster key or the Blast touch button for continuous fire. Missiles hit harder and use ammo. Duck under
        drone shots: a red line means a drone is about to fire.
      </p>
      <dl className="gadget-guide">
        <div>
          <dt>
            <i className="lab-dot lab-dot--shield" />
            Phase shield
          </dt>
          <dd>Absorbs one hit.</dd>
        </div>
        <div>
          <dt>
            <i className="lab-dot lab-dot--boots" />
            Gravity boots
          </dt>
          <dd>Double jump for ten seconds.</dd>
        </div>
        <div>
          <dt>
            <i className="lab-dot" />
            Portal cell
          </dt>
          <dd>Reloads one missile.</dd>
        </div>
      </dl>
      {showCheats && (
        <details className="cheat-guide">
          <summary>Cheat codes</summary>
          <p>
            Press <kbd>`</kbd> during a run to open the console, type a code and press <kbd>Enter</kbd>. Cheats pause
            saving: the run will not count toward your best or runs.
          </p>
          <dl>
            {cheats.map(({ code, description }) => (
              <div key={code}>
                <dt>
                  <code>{code}</code>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
            <div>
              <dt>
                <code>↑ ↑ ↓ ↓ ← → ← → B A</code>
              </dt>
              <dd>On the garage screen: unlock every level.</dd>
            </div>
          </dl>
        </details>
      )}
    </ArcadeDialog>
  );
}
