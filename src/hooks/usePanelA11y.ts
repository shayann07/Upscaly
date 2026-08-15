import { useEffect, useRef } from 'react';

/**
 * Focus management for the right-hand nav panels (models, history, about).
 *
 * These are deliberately *not* treated as modal dialogs. They sit alongside a
 * fully interactive canvas with no backdrop, so they get `role="dialog"`
 * without `aria-modal` and without a focus trap -- claiming modality would
 * tell assistive tech the rest of the app is inert when it plainly isn't.
 * (ConfirmCancelDialog is the opposite case: it *is* modal, and correctly
 * sets aria-modal and traps Tab.)
 *
 * What these panels do need is focus behaviour. Previously none of them had
 * any: opening one left focus wherever it was, so a keyboard or screen-reader
 * user got no announcement that a panel had appeared and had to tab through
 * the entire app to reach it, and closing one dropped focus to the document
 * body. This moves focus onto the labelled panel when it opens and returns it
 * to whatever opened it on close.
 *
 * Call this above any early return, so the hook order stays stable.
 */
export function usePanelA11y<T extends HTMLElement>(isOpen: boolean) {
  const panelRef = useRef<T>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    restoreFocusRef.current = previouslyFocused;

    // Focus the panel itself rather than its first control: the panel carries
    // the accessible name, so this announces what opened instead of jumping
    // straight to a button with no context.
    panelRef.current?.focus();

    return () => {
      // Only pull focus back if it is still inside the panel -- if the user
      // has since clicked elsewhere, yanking it would be the more surprising
      // behaviour.
      const active = document.activeElement;
      const focusEscaped = !panelRef.current || !panelRef.current.contains(active);
      if (!focusEscaped) {
        restoreFocusRef.current?.focus?.();
      }
      restoreFocusRef.current = null;
    };
  }, [isOpen]);

  return panelRef;
}
