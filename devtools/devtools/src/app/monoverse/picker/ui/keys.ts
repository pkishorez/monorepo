import type { KeyboardEvent } from 'react';

/*
 * The Picker's keys, read in its search field, as the code app's Picker
 * binds them:
 *
 *   ↑ ↓, Ctrl+P Ctrl+N   move the highlight, round from the last to the first
 *   Enter                open the Project highlighted, go into the folder
 *   Mod+Enter            open the folder highlighted as a Project, or, with
 *                        none, the folder open
 *   Backspace            in an empty search, back a Step
 *   Mod+Backspace        in an empty search, remove the Project highlighted;
 *   Shift+Delete         the same, whatever the search
 *   Escape               clear the search, else close
 */

export type KeyMessage =
  | { readonly _tag: 'Moved'; readonly by: number }
  | { readonly _tag: 'Picked'; readonly value: string }
  | { readonly _tag: 'Chose'; readonly on: string | null }
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'RemoveAsked'; readonly id: string }
  | { readonly _tag: 'Dismissed' };

export interface Keyed {
  readonly query: string;
  /** The row highlighted, by value; '' for none. */
  readonly active: string;
  /** The Project highlighted, which can be removed. */
  readonly removable: string | null;
  readonly canBack: boolean;
  /** On a folder Step, where Mod+Enter with no row chooses the folder open. */
  readonly inFolder: boolean;
}

/** The Message a key asks for, or null to leave the key to the field. */
export function keyMessage(
  event: KeyboardEvent,
  { query, active, removable, canBack, inFolder }: Keyed,
): KeyMessage | null {
  if (event.nativeEvent.isComposing) return null;
  const mod = event.metaKey || event.ctrlKey;
  switch (event.key) {
    case 'ArrowDown':
      return { _tag: 'Moved', by: 1 };
    case 'ArrowUp':
      return { _tag: 'Moved', by: -1 };
    case 'n':
    case 'p':
      return event.ctrlKey && !event.metaKey && !event.altKey
        ? { _tag: 'Moved', by: event.key === 'n' ? 1 : -1 }
        : null;
    case 'Enter':
      if (mod)
        return active !== ''
          ? { _tag: 'Chose', on: active }
          : inFolder
            ? { _tag: 'Chose', on: null }
            : null;
      return active === '' ? null : { _tag: 'Picked', value: active };
    case 'Escape':
      return query !== ''
        ? { _tag: 'Typed', query: '' }
        : { _tag: 'Dismissed' };
    case 'Backspace':
      if (query !== '' || event.altKey) return null;
      if (mod)
        return removable === null
          ? null
          : { _tag: 'RemoveAsked', id: removable };
      return canBack && !event.shiftKey ? { _tag: 'Back' } : null;
    case 'Delete':
      return event.shiftKey && removable !== null
        ? { _tag: 'RemoveAsked', id: removable }
        : null;
    default:
      return null;
  }
}

/** Whether the keys are a Mac's, which write Mod as ⌘. */
export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
