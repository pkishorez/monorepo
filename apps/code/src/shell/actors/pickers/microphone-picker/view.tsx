import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { ChevronUpIcon } from '@kestack/web-platform/ui/components/lucide';
import { createContext, use, useEffect, type RefObject } from 'react';
import { keys, useBound } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { MicrophonePickerLive, MicrophonesView } from './actor.ts';

/*
 * The Microphone Picker: `d` opens it centred from anywhere, drawn by the
 * View the shell keeps; the Button, the small chevron beside the Status
 * Line's mic, opens it by a click as a popover by it. Opened by a tap,
 * there or from elsewhere through `Opener`, such as the Touch Draft's
 * Quick actions, the View the shell keeps draws it in a Drawer.
 */

const LABEL = 'Choose the microphone';

/** Where the View keeps how to open it from elsewhere, while it is drawn. */
export const Opener = createContext<RefObject<
  ((how: 'keys' | 'touch') => void) | null
> | null>(null);

export const MicrophonePickerView = View.make(
  MicrophonePickerLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const choose = (how: 'keys' | 'touch') =>
      open(() => send({ _tag: 'Open', how }));
    keys.useAction('app.microphone', () => choose('keys'));
    const opener = use(Opener);
    useEffect(() => {
      if (opener === null) return;
      opener.current = choose;
      return () => void (opener.current = null);
    });
    return (
      <Picker.Frame
        how={model.picking === 'mouse' ? null : model.picking}
        mode="drawer"
        label={LABEL}
      >
        {children.picker && <MicrophonesView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);

export const MicrophonePickerButton = View.make(
  MicrophonePickerLive,
  ({ model, children, send }) => {
    const bound = useBound('app.microphone');
    return (
      <Picker.Frame
        how={model.picking === 'mouse' ? 'mouse' : null}
        mode="drawer"
        label={LABEL}
        onOpen={(how) => send({ _tag: 'Open', how })}
        side="top"
        className="w-80"
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={LABEL}
            title={bound === null ? LABEL : `${LABEL} (${bound})`}
            className="-ml-1 w-4 shrink-0 text-muted-foreground"
          >
            <ChevronUpIcon aria-hidden />
          </Button>
        }
      >
        {children.picker && <MicrophonesView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
