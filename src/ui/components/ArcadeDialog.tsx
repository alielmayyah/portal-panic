import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { dialogIn } from '../anim';

export interface ArcadeDialogProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  /** Element focused whenever the dialog opens (or `focusKey` changes). Defaults to the dialog. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Change it to re-run initial focus while open (new content in the same dialog). */
  focusKey?: unknown;
  /** Esc / Android back. The native close is always prevented; the app decides. */
  onCancel?: () => void;
  /** The browser closed the dialog by itself while `open` was still true. Defaults to onCancel. */
  onDismiss?: () => void;
  /** Ignore Esc entirely (result card: you must pick Retry or Garage). */
  blockEscape?: boolean;
  /**
   * Ignore Enter/Space for this many ms after opening, so a held or mashed game key cannot press the
   * newly focused button. 0 disables. Default 400.
   */
  armDelay?: number;
}

const ACTIVATE = ['Space', 'Enter', 'NumpadEnter'];

/** Native modal <dialog> with the old focus, cancel and key-arming behaviour. */
export function ArcadeDialog(props: ArcadeDialogProps) {
  const { open, children, className = '', labelledBy, describedBy, initialFocusRef, focusKey, blockEscape = false, armDelay = 400 } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const wantOpen = useRef(open);
  const armedAt = useRef(0);
  const swallowSpaceUp = useRef(false);
  const handlers = useRef(props);
  handlers.current = props;

  useLayoutEffect(() => {
    wantOpen.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
      dialogIn(dialog);
    }
    (initialFocusRef?.current ?? dialog).focus({ preventScroll: true });
    armedAt.current = performance.now() + armDelay;
  }, [open, focusKey, initialFocusRef, armDelay]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      const { onCancel: cancel, blockEscape: blocked } = handlers.current;
      if (!blocked) cancel?.();
      else handlers.current.onDismiss?.();
    };
    // Browsers may refuse to cancel a repeated close request (Esc, Android back); never strand the player.
    const onClose = () => {
      if (!wantOpen.current) return;
      const { onDismiss, onCancel: cancel } = handlers.current;
      (onDismiss ?? cancel)?.();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.code === 'Space') swallowSpaceUp.current = false;
    if (ACTIVATE.includes(event.code) && (event.repeat || performance.now() < armedAt.current)) {
      event.preventDefault();
      if (event.code === 'Space') swallowSpaceUp.current = true;
      return;
    }
    if (event.code === 'Escape') {
      // Handle Esc here so the app's global key handler never sees it twice (Esc also toggles pause).
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !blockEscape) handlers.current.onCancel?.();
    }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (swallowSpaceUp.current && event.code === 'Space') {
      swallowSpaceUp.current = false;
      event.preventDefault();
    }
  };

  return (
    <dialog
      ref={ref}
      className={`dialog-card ${className}`.trim()}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      {children}
    </dialog>
  );
}
