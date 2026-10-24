import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { ChevronUpIcon } from '@kestack/web-platform/ui/components/lucide';
import { keys, useBound } from '../../../keys.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { MicrophonePickerLive, MicrophonesView } from './actor.ts';

/*
 * The Microphone Picker: `d` opens it centred from anywhere, drawn by the
 * View the shell keeps; the Button, the small chevron beside the Status
 * Line's mic, opens it by pointer as a popover by it, and by a tap in a
 * Drawer.
 */

const LABEL = 'Choose the microphone';

export const MicrophonePickerView = View.make(
  MicrophonePickerLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    keys.useAction('app.microphone', () =>
      open(() => send({ _tag: 'Open', how: 'keys' })),
    );
    return (
      <Picker.Frame
        how={model.picking === 'keys' ? 'keys' : null}
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
        how={model.picking === 'pointer' ? 'pointer' : null}
        mode="drawer"
        label={LABEL}
        onOpen={() => send({ _tag: 'Open', how: 'pointer' })}
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
