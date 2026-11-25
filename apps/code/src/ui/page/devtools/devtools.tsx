import type { ReactNode } from 'react';
import { KabukiDevtools } from '@kestack/devtools-kabuki/app';
import type { KabukiDevtoolsProps } from '@kestack/devtools-kabuki/app';
import { Start } from '@kestack/kabuki/start';

/*
 * Kabuki's Inspector around every page, while developing, in Web
 * Platform's Dock: the button in the bottom-right corner opens it full
 * screen, as a bar, a side panel or a floating window. It reads code
 * through its Kabuki Session, answered in the page by code's running app.
 * It sits outside code's tree, so a Step picked Time Travels code itself,
 * read only until it goes back to now. Not on a phone, where the button
 * would cover the Draft's Send and Stop.
 * Ctrl+/ or ⌘/ opens and closes them too; code shows its keys with
 * Ctrl+? instead. The Inspector's code loads the first time it is opened.
 * In fake mode it is given code's FakeWorld, loaded with it, and its World
 * tab shows each Fake and runs its controls.
 */

export function Devtools({
  world,
  children,
}: {
  readonly world: KabukiDevtoolsProps['world'];
  readonly children: ReactNode;
}) {
  return (
    <KabukiDevtools
      runtime={Start.useRuntime()}
      {...(world ? { world } : {})}
      storageKey="code:devtools"
      onPhones={false}
    >
      {children}
    </KabukiDevtools>
  );
}
