import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';

type Machine = typeof MachineSchema.Type;
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { ChevronsUpDownIcon } from '@kestack/web-platform/components/lucide';
import { Mark } from '../../../ui/mark/index.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { useHealth } from '../connection/index.ts';
import { MachineSwitcherLive, MachinesView } from './actor.ts';

/*
 * The Machine Switcher where the logo was, at the top of the sidebar: the
 * mark, the Machine the app is on, and a dot while it is out of reach.
 * Clicking it opens the Picker as a popover under it.
 */

const DOT = {
  Connected: null,
  Unknown: 'bg-muted-foreground',
  Seen: 'bg-warning',
  Down: 'bg-destructive',
} as const;

export const MachineSwitcherView = View.make(
  MachineSwitcherLive,
  ({ model, props, children, send }) => {
    const machine: Machine | undefined = props.machines?.find(
      ({ id }) => id === props.on,
    );
    const dot = DOT[useHealth()._tag];
    return (
      <Picker.Frame
        how={model.picking}
        label="Switch machine"
        onOpen={() => send({ _tag: 'Open', how: 'pointer', now: Date.now() })}
        side="bottom"
        align="start"
        className="w-80"
        trigger={
          <Button
            variant="ghost"
            aria-label={`Machine: ${machine?.name ?? 'unknown'}. Switch machine`}
            title="Switch machine"
            className="h-8 w-full justify-start gap-2 px-2 text-[15px] font-semibold tracking-tight"
          >
            <Mark className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{machine?.name ?? 'code'}</span>
            {dot !== null && (
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${dot}`}
              />
            )}
            <ChevronsUpDownIcon
              aria-hidden
              className="ml-auto size-3.5 shrink-0 text-muted-foreground"
            />
          </Button>
        }
      >
        {children.picker && <MachinesView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
