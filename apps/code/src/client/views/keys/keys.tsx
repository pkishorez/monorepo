import { KeysHelp } from '@kestack/web-platform/recipes/keyboard';
import { type ReactNode, useSyncExternalStore } from 'react';
import { keys } from '../../keys.ts';

/*
 * The app's keyboard, from `keys.ts`, with Vim Mode kept in this browser's
 * localStorage: a preference, not the app's state. The server renders with
 * it off. Mod+Alt+V turns it on and off from anywhere, and the help sheet
 * is drawn while its Surface is Active.
 */

const STORED = 'ai:vim';
const listeners = new Set<() => void>();

const stored = {
  read: () => localStorage.getItem(STORED) === 'on',
  write: (on: boolean) => {
    if (on) localStorage.setItem(STORED, 'on');
    else localStorage.removeItem(STORED);
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    // Another tab changed it.
    window.addEventListener('storage', listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', listener);
    };
  },
};

export function Keyboard({ children }: { readonly children: ReactNode }) {
  const vim = useSyncExternalStore(stored.subscribe, stored.read, () => false);
  return (
    <keys.Provider vim={vim} onVimChange={stored.write}>
      <VimSwitch />
      {children}
      <KeysHelp keys={keys} surface="help" />
    </keys.Provider>
  );
}

function VimSwitch() {
  const { vim } = keys.useKeyboard();
  keys.useAction('app.vim', vim.toggle);
  return null;
}
