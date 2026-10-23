import { KeysHelp } from '@kestack/web-platform/recipes/keyboard';
import type { ReactNode } from 'react';
import { keys } from '../keys.ts';

/*
 * The app's keyboard, from `keys.ts`, always on, with the user's own
 * Bindings from Device State, which the root page read before drawing
 * this. The help sheet is drawn while its Surface is Active, and lists the
 * keys as bound now.
 */

export function Keyboard({
  bindings,
  children,
}: {
  readonly bindings: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly children: ReactNode;
}) {
  return (
    <keys.Provider vim bindings={bindings}>
      {children}
      <KeysHelp keys={keys} surface="help" finalFocus={false} />
    </keys.Provider>
  );
}
