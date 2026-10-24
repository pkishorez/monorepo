import { View } from '@kestack/kabuki/react';
import { Switch } from '@kestack/web-platform/components/switch';
import { keys, useBound } from '../../../keys.ts';
import { SettingsLive } from './actor.ts';
import { MachineSettings } from './machines/index.ts';
import { Shortcuts } from './shortcuts/index.ts';

/*
 * Settings: every Machine, each with its own settings in its own section,
 * then the keyboard: Vim Mode, and every Action's keys, which a touch
 * screen with no keyboard leaves out.
 */

export const SettingsView = View.make(SettingsLive, ({ root, children }) => (
  <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 md:py-10">
      <MachineSettings.view instance={children.machines} />
      <div className="flex flex-col gap-6 touch:hidden keyboard:flex">
        <VimSetting />
        <Shortcuts.view instance={children.shortcuts} />
      </div>
    </div>
  </div>
));

/** Vim Mode, kept in this browser: off, the app is worked as any other is. */
function VimSetting() {
  const { vim } = keys.useKeyboard();
  const bound = {
    side: useBound('app.side'),
    page: useBound('app.page'),
    write: useBound('content.write'),
    help: useBound('app.help'),
    vim: useBound('app.vim'),
  };
  return (
    <section
      aria-labelledby="keyboard"
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id="keyboard" className="text-sm font-semibold">
        Keyboard
      </h2>
      <label className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">Vim mode</span>
          <span className="text-sm text-muted-foreground">
            Plain keys become shortcuts: j and k move through the sidebar and
            the transcript, {bound.side} and {bound.page} move between them,{' '}
            {bound.write} writes in the Draft, and {bound.help} lists every key.
            The app floats as a window, and a line at its foot says where you
            are. Off, the Draft is a text box as any other, and the Ctrl keys
            still work. {bound.vim} turns it on and off.
          </span>
        </span>
        <Switch className="mt-0.5" checked={vim.on} onCheckedChange={vim.set} />
      </label>
    </section>
  );
}
