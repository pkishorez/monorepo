import { Plus } from 'lucide-react';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { CounterRow } from './counter/index.js';
import { Counters } from './counters.js';

export const CountersView = View.make(Counters, ({ model, send }) => (
  <div className="size-full overflow-y-auto p-6">
    <div className="mx-auto flex max-w-md flex-col gap-3">
      {model.rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <CounterRow
            count={row.count}
            send={(message) =>
              send({ _tag: 'GotCounterMessage', id: row.id, message })
            }
          />
          <Button
            variant="ghost"
            onClick={() => send({ _tag: 'ClickedRemoveRow', id: row.id })}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() => send({ _tag: 'ClickedAddRow' })}
      >
        <Plus /> Add Counter
      </Button>
    </div>
  </div>
));
