import { useDevice } from '@kestack/web-platform/ui/input';
import type { ReactNode } from 'react';
import { keys } from './commands.ts';

/*
 * The keyboard the frame's View draws around the page: the app's keys
 * (`commands.ts`), with Vim Mode and the user's own Bindings from
 * Preferences, which the frame read before drawing this. Vim Mode is off
 * until turned on, by Mod+Alt+V from anywhere or in Settings, which asks
 * the frame to keep it. On a device with no keyboard, however wide, it is
 * off whatever is kept, and cannot be turned on; the kept choice holds
 * again once a key is pressed. Nor does focus move there on its own, so no
 * field raises the on-screen keyboard unasked: it goes only where the user
 * taps, or where a Picker opts in. Voice's keys are bound here too: Space
 * from the page's or the sidebar's Normal Mode, never where Space types,
 * Ctrl+Space anywhere, a Picker and the Composer included, start and stop
 * a Dictation; `d` opens the Microphone Picker; Escape never touches a
 * Dictation.
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

/** Voice's keys: start or stop a Dictation, and choose the microphone. */
export function useVoiceKeys(voice: {
  readonly toggle: () => void;
  readonly chooseMicrophone: (how: 'keys') => void;
}) {
  keys.useAction('app.dictate', voice.toggle);
  keys.useAction('app.dictateAnywhere', voice.toggle);
  keys.useAction('picker.dictate', voice.toggle);
  keys.useAction('app.microphone', () => voice.chooseMicrophone('keys'));
}

function VimSwitch() {
  const { vim } = keys.useKeyboard();
  keys.useAction('app.vim', vim.toggle);
  return null;
}
