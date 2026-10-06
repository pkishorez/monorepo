import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import { type Shortcut, useKeys } from '@kstackz/use-keys';
import { useEffect, useRef, useState } from 'react';
import {
  type ActionId,
  bindingOf,
  keys,
  useCommand,
  written,
} from '@ledger/core/client/commands';
import { BindingKeys, recorded } from '../../../kit/keyboard/index.ts';
import { useChangeSettings, useSettings } from '../../../app/index.ts';
import { Row } from './rows.tsx';

// Ms after the last key before a recording ends: one key is a Shortcut,
// several a Sequence.
const SETTLE = 900;

type Group = {
  readonly surface: string;
  readonly title: string;
  readonly inside?: ReadonlyArray<Group>;
};

// Where each Surface's Commands are listed, as the Surfaces nest.
const GROUPS: ReadonlyArray<Group> = [
  { surface: '', title: 'Everywhere' },
  { surface: 'sidebar', title: 'Sidebar' },
  { surface: 'home', title: 'Home' },
  {
    surface: 'entries',
    title: 'Entries',
    inside: [{ surface: 'entries.entry', title: 'An entry' }],
  },
  {
    surface: 'months',
    title: 'Months',
    inside: [{ surface: 'months.month', title: 'A month' }],
  },
  { surface: 'add', title: 'Add' },
  { surface: 'account', title: 'Account' },
  { surface: 'palette', title: 'Find a command' },
];

const surfaceOf = (id: string) => id.split('.').slice(0, -1).join('.');

type Action = ReturnType<typeof keys.useStatus>['actions'][number];

/**
 * Every Command with its keys, as the Places nest. Recording opens the
 * recording Surface, where only Escape works, so any other key can be
 * recorded; the new keys work the moment they are saved, in every tab of this
 * device.
 */
export function KeysTab() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const { actions } = keys.useStatus();
  const settings = useSettings();
  const changeSettings = useChangeSettings();
  const [recording, setRecording] = useState<ActionId>();
  const [steps, setSteps] = useState<ReadonlyArray<Shortcut>>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const own = settings.keys;
  const on = settings.keysOn;

  const change = (
    id: ActionId,
    binding: Parameters<typeof written>[0] | undefined,
  ) => {
    const { [id]: _, ...rest } = own;
    changeSettings({
      keys: binding === undefined ? rest : { ...rest, [id]: written(binding) },
    });
  };
  const stop = () => {
    clearTimeout(timer.current);
    setRecording(undefined);
    setSteps([]);
    closeSurface('settings.recording');
  };
  const record = (id: ActionId) => {
    setRecording(id);
    openSurface('settings.recording');
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useCommand('settings.recording.cancel', stop);

  useKeys({
    enabled: surface === 'settings.recording',
    onKey: (key, all) => {
      if (key.upAt !== null || key.name === 'Escape') return;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(key.name)) return;
      const held = new Set(
        all.filter((other) => other.upAt === null).map((other) => other.name),
      );
      const next = [...steps, recorded(key.name, held)];
      setSteps(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (recording) change(recording, bindingOf(next));
        stop();
      }, SETTLE);
    },
  });

  const rowOf = (action: Action) => (
    <li key={action.id} className="flex min-h-11 items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">
        {action.description}
      </span>
      {action.id in own && recording !== action.id && (
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => change(action.id, undefined)}
        >
          Reset
        </Button>
      )}
      {recording === action.id ? (
        <span className="flex h-8 items-center gap-1.5 rounded-md border border-dashed px-2 text-xs text-muted-foreground">
          {steps.length === 0
            ? 'Press keys…'
            : steps.map((step, i) => (
                <BindingKeys key={i} binding={step} always />
              ))}
        </span>
      ) : (
        <button
          type="button"
          disabled={recording !== undefined}
          onClick={() => record(action.id)}
          aria-label={`Change the keys of ${action.description}`}
          className="focus-ring flex h-8 flex-wrap items-center justify-end gap-1.5 rounded-md px-1.5 hover:bg-accent disabled:opacity-50"
        >
          {action.bindings.map(({ binding }, i) => (
            <BindingKeys key={i} binding={binding} always />
          ))}
        </button>
      )}
    </li>
  );

  const groupOf = (group: Group) => {
    const list = actions.filter(
      (action) => surfaceOf(action.id) === group.surface,
    );
    return (
      <div key={group.surface} className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">
          {group.title}
        </h3>
        <ul className="divide-y">{list.map(rowOf)}</ul>
        {group.inside && (
          <div className="mt-3 space-y-6 border-l pl-4">
            {group.inside.map(groupOf)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <div className="divide-y">
        <Row
          label="Keyboard shortcuts"
          hint="A key for every command. With them off, ⌘K still finds one."
        >
          <Switch
            checked={on}
            onCheckedChange={(keysOn) => changeSettings({ keysOn })}
            aria-label="Keyboard shortcuts"
          />
        </Row>
      </div>
      {on && (
        <div className="space-y-8">
          <p className="text-sm text-pretty text-muted-foreground">
            Choose a command’s keys to press new ones: one key, or a few in a
            row. Space then E gives the sidebar the keys, and Escape gives them
            back.
          </p>
          {GROUPS.map(groupOf)}
        </div>
      )}
    </div>
  );
}
