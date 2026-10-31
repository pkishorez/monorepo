import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { DoorClosedIcon, DoorOpenIcon, LockIcon } from 'lucide-react';
import { DoorLive } from './door.ts';

const ICONS = { Locked: LockIcon, Closed: DoorClosedIcon, Open: DoorOpenIcon };

// Every button is always there: the Door decides which ones mean anything.
const ACTIONS = [
  { message: 'Unlocked', label: 'Unlock' },
  { message: 'Locked', label: 'Lock' },
  { message: 'Opened', label: 'Open' },
  { message: 'Shut', label: 'Shut' },
] as const;

const DoorView = View.make(DoorLive, ({ _tag, model, send, root }) => {
  const Icon = ICONS[_tag];
  return (
    <div {...root} className="flex w-full max-w-60 flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-20 place-items-center rounded-2xl border border-border bg-muted/40">
          <Icon className="size-9" strokeWidth={1.5} />
        </span>
        <span className="text-lg font-medium">{_tag}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Opened {model.opened} {model.opened === 1 ? 'time' : 'times'}
        </span>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {ACTIONS.map(({ message, label }) => (
          <Button
            key={message}
            variant="outline"
            onClick={() => send({ _tag: message })}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
});

export const DoorApp = View.app(DoorView, { name: 'docs:state-machine' });
