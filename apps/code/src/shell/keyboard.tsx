import { KeysHelp } from '@kestack/web-platform/recipes/keyboard';
import type { ReactNode } from 'react';
import { keys } from '../keys.ts';

/*
 * The app's keyboard, from `keys.ts`, with Vim Mode and the user's own
 * Bindings from Device State, which the root page read before drawing
 * this. Turning Vim Mode on or off, by Mod+Alt+V from anywhere or from
 * Settings, asks the root page, which keeps it. The help sheet is drawn
 * while its Surface is Active, and lists the keys as bound now.
 */

export function Keyboard({
  vim,
  bindings,
  onVimChange,
  children,
}: {
  readonly vim: boolean;
  readonly bindings: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly onVimChange: (on: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <keys.Provider vim={vim} onVimChange={onVimChange} bindings={bindings}>
      <VimSwitch />
      {children}
      <KeysHelp keys={keys} surface="help" finalFocus={false} />
    </keys.Provider>
  );
}

function VimSwitch() {
  const { vim } = keys.useKeyboard();
  keys.useAction('app.vim', vim.toggle);
  return null;
}
