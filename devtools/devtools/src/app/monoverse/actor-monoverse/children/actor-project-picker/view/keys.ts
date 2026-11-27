import type { KeyboardEvent } from 'react';

export type KeyMessage =
  | { readonly _tag: 'Moved'; readonly by: number }
  | { readonly _tag: 'Picked'; readonly value: string }
  | { readonly _tag: 'Chose'; readonly on: string | null }
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'WentBack' }
  | { readonly _tag: 'RemoveAsked'; readonly id: string }
  | { readonly _tag: 'Dismissed' };

export interface Keyed {
  readonly query: string;
  readonly active: string;
  readonly removable: string | null;
  readonly canBack: boolean;
  readonly inFolder: boolean;
}

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
      return canBack && !event.shiftKey ? { _tag: 'WentBack' } : null;
    case 'Delete':
      return event.shiftKey && removable !== null
        ? { _tag: 'RemoveAsked', id: removable }
        : null;
    default:
      return null;
  }
}

export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
