import { CONTROL_LABELS, keyName as defaultKeyName, type ControlScheme } from '../../core/input';

export interface ControlsListProps {
  /** CONTROL_SCHEMES[mode] from core/input. */
  scheme: readonly ControlScheme[];
  /** Label for a key code. Defaults to core/input keyName (layout-aware after refineKeyNames). */
  keyName?: (code: string) => string;
  labels?: readonly string[];
}

/** Key legend: used under the course (.race-legend) and in the How to play guide. */
export function ControlsList({ scheme, keyName = defaultKeyName, labels = CONTROL_LABELS }: ControlsListProps) {
  return (
    <>
      {scheme.map(({ label, keys }) => (
        <div className="control-group" key={label}>
          {scheme.length > 1 && <strong>{label}</strong>}
          {keys.map((group, index) => (
            <span className="control-pair" key={index}>
              <span>
                {group.map((code, i) => (
                  <span key={code}>
                    {i > 0 && ' '}
                    <kbd>{keyName(code)}</kbd>
                  </span>
                ))}
              </span>
              <span>{labels[index]}</span>
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
