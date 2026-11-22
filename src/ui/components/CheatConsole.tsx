import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

export interface CheatFeedback {
  text: string;
  ok: boolean;
}

export interface CheatConsoleProps {
  open: boolean;
  /** Enter: the raw text (the app normalises case/spaces via core/cheats). */
  onSubmit: (code: string) => void;
  /** Esc or Backquote. */
  onClose: () => void;
  /** Result line for the last code ("God mode on" / "Unknown code"). */
  feedback?: CheatFeedback | null;
}

/**
 * Cheat input overlay inside the course window. Every key event stops propagating here, so the
 * game's window/document key handlers never see typing. Render it while the app has the run paused.
 */
export function CheatConsole({ open, onSubmit, onClose, feedback = null }: CheatConsoleProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue('');
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const stop = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.code === 'Escape' || event.code === 'Backquote') {
      event.preventDefault();
      onClose();
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = value.trim();
    if (code) onSubmit(code);
    setValue('');
  };

  return (
    <div className="cheat-console" role="dialog" aria-modal="false" aria-labelledby={`${id}-label`}>
      <form onSubmit={submit} onKeyUp={stop} className="flex items-center gap-2">
        <label id={`${id}-label`} htmlFor={`${id}-input`} className="cheat-console__prompt">
          CHEAT&gt;
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          className="cheat-console__input min-w-0 flex-1"
          type="text"
          value={value}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          aria-describedby={`${id}-help ${id}-feedback`}
          onChange={(event) => setValue(event.target.value.replace(/`/g, ''))}
          onKeyDown={onKeyDown}
        />
      </form>
      <p id={`${id}-help`} className="cheat-console__help">
        Enter to apply · Esc to close
      </p>
      <p
        id={`${id}-feedback`}
        className={`cheat-console__feedback${feedback ? (feedback.ok ? ' is-ok' : ' is-error') : ''}`}
        role="status"
      >
        {feedback?.text ?? ''}
      </p>
    </div>
  );
}
