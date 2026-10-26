import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { type ReactNode, use } from 'react';
import { keys, useBound } from '../../../../keys.ts';
import { MicrophonePicker } from '../../../actors/pickers/microphone-picker/index.ts';
import { GeneralLive } from './actor.ts';

/*
 * General: one card of this browser's settings, a row each, its name and
 * what it does on the left and its control on the right: Vim Mode, which
 * a touch screen with no keyboard leaves out; the Microphone, chosen in
 * the Microphone Picker; and Smart Input and Smart Displacement, which a
 * keyboard leaves out.
 */

/** One setting: its name over what it does, and its control beside them. */
function Row({
  id,
  name,
  children,
  control,
  className,
}: {
  readonly id: string;
  readonly name: string;
  readonly children: ReactNode;
  readonly control: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={`${id}-name`}
      className={cn('flex items-start gap-4 p-4 sm:px-5', className)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={`${id}-name`} className="text-sm font-medium">
          {name}
        </span>
        <span className="max-w-[65ch] text-sm text-pretty text-muted-foreground">
          {children}
        </span>
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
    </div>
  );
}

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
    <Row
      id="vim"
      name="Vim mode"
      className="touch:hidden keyboard:flex"
      control={
        <Switch
          aria-labelledby="vim-name"
          className="mt-0.5"
          checked={vim.on}
          onCheckedChange={vim.set}
        />
      }
    >
      Plain keys become shortcuts: j and k move through the sidebar and the
      transcript, {bound.side} and {bound.page} move between them, {bound.write}{' '}
      writes in the Draft, and {bound.help} lists every key. The app floats as a
      window, and a line at its foot says where you are. Off, the Draft is a
      text box as any other, and the Ctrl keys still work. {bound.vim} turns it
      on and off.
    </Row>
  );
}

export const GeneralView = View.make(GeneralLive, ({ root, model, send }) => {
  const opener = use(MicrophonePicker.Opener);
  const { device } = model;
  return (
    <section
      {...root}
      aria-labelledby="general"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="general" className="text-sm font-semibold">
          General
        </h2>
        <p className="text-sm text-muted-foreground">
          Kept in this browser only.
        </p>
      </header>
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        <VimSetting />
        <Row
          id="microphone"
          name="Microphone"
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 keyboard:h-8"
              aria-label="Choose the microphone"
              onClick={(event) =>
                opener?.current?.(
                  event.nativeEvent instanceof PointerEvent &&
                    event.nativeEvent.pointerType !== 'mouse' &&
                    event.nativeEvent.pointerType !== ''
                    ? 'touch'
                    : 'keys',
                )
              }
            >
              Choose
            </Button>
          }
        >
          {device === null ? (
            <Skeleton className="mt-1 h-4 w-28" />
          ) : device.microphone === null ? (
            'Dictations record from the system default.'
          ) : (
            'Dictations record from the one chosen here, or the system default while it is not connected.'
          )}
        </Row>
        <Row
          id="smart-input"
          name="Smart input"
          className="keyboard:hidden"
          control={
            device === null ? (
              <Skeleton className="mt-0.5 h-6 w-11 rounded-full" />
            ) : (
              <Switch
                aria-labelledby="smart-input-name"
                className="mt-0.5"
                checked={device.smartInput}
                onCheckedChange={(on) => send({ _tag: 'SmartInputChosen', on })}
              />
            )
          }
        >
          A tap opens the Draft without the keyboard, and a tap in its words
          puts the cursor there, for the next Dictation; Edit types. Off, a tap
          opens it and types at once.
        </Row>
        <Row
          id="smart-displacement"
          name="Smart displacement"
          className="keyboard:hidden"
          control={
            device === null ? (
              <Skeleton className="mt-0.5 h-6 w-11 rounded-full" />
            ) : (
              <Switch
                aria-labelledby="smart-displacement-name"
                className="mt-0.5"
                checked={device.smartDisplacement}
                onCheckedChange={(on) =>
                  send({ _tag: 'SmartDisplacementChosen', on })
                }
              />
            )
          }
        >
          Dragging the cursor, or an end of a selection, holds it a little above
          your finger, so the text under it stays in sight. A tap still puts it
          where you touch.
        </Row>
      </div>
    </section>
  );
});
