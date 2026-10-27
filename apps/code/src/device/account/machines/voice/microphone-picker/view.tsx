import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { ChevronUpIcon } from 'lucide-react';
import { createContext, use, useEffect, type RefObject } from 'react';
import * as Picker from '../../../../../ui/controls/picker/index.ts';
import { MicrophonePickerLive, MicrophonesView } from './actor.ts';

/*
 * The Microphone Picker: `d`, bound by Layout, opens it centred from
 * anywhere, drawn by the View Voice keeps; the Button, the small chevron
 * beside the Status Line's mic, opens it by a click as a popover by it.
 * Opened by a tap, there or from elsewhere through `Opener`, such as the
 * Touch Draft's Quick actions, the View Voice keeps draws it in a Drawer.
 */

const LABEL = 'Choose the microphone';

/** Where the View keeps how to open it from elsewhere, while it is drawn. */
export const Opener = createContext<RefObject<
  ((how: 'keys' | 'touch') => void) | null
> | null>(null);

/** The keys that open it, for the Button's title, from what draws the Button. */
export const Keys = createContext<string | null>(null);

export const MicrophonePickerView = View.make(
  MicrophonePickerLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const choose = (how: 'keys' | 'touch') =>
      open(() => send({ _tag: 'Open', how }));
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
    const bound = use(Keys);
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
