// oxlint-disable-next-line no-restricted-imports -- keys and a release anywhere on the page are window listeners, kept in the View so a View of the past sends nothing.
import { useEffect } from 'react';

/** ⌘Z or Ctrl+Z undoes; with Shift, or ⌘Y / Ctrl+Y, redoes. */
export const useUndoKeys = (undo: () => void, redo: () => void) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
};

/** Letting go of the pointer anywhere on the page, while `active`. */
export const useRelease = (active: boolean, release: () => void) => {
  useEffect(() => {
    if (!active) return;
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, [active, release]);
};
