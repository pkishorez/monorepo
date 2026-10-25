import { useDevice } from '@kestack/web-platform/ui/input';
import type { ReactNode } from 'react';
import { keys } from '../keys.ts';

/*
 * The app's keyboard, from `keys.ts`, with Vim Mode and the user's own
 * Bindings from Device State, which the root page read before drawing
 * this. Vim Mode is off until turned on, by Mod+Alt+V from anywhere or in
 * Settings, which asks the root page to keep it. On a device with no
 * keyboard, however wide, it is off whatever is kept, and cannot be turned
 * on; the kept choice holds again once a key is pressed. Nor does focus move
 * there on its own, so no field raises the on-screen keyboard unasked: it
 * goes only where the user taps, or where a Picker opts in.
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
  const { keyboard } = useDevice();
  return (
    <keys.Provider
      vim={vim && keyboard}
      onVimChange={(on) => {
        if (keyboard) onVimChange(on);
      }}
      autoFocus={keyboard}
      bindings={bindings}
    >
      <VimSwitch />
      {children}
    </keys.Provider>
  );
}

function VimSwitch() {
  const { vim } = keys.useKeyboard();
  keys.useAction('app.vim', vim.toggle);
  return null;
}
