import { cn } from '@kstackz/ui-toolkit/utils';
import { useEffect, useId, useState } from 'react';
import { BindingKeys } from './binding-keys.tsx';
import { type ActionId, keys } from './keys.ts';

type Status = ReturnType<typeof keys.useStatus>;

/** A command the palette can run: an Action that worked where it opened. */
export type Command = Status['actions'][number];

/**
 * The palette, whole: the key that opens it, the dialog shown while its
 * Surface is Active, and closing it back to whoever opened it. It lists every Action that worked
 * where it opened, and runs the chosen one once the Surface it came from
 * is back.
 */
export function Palette() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const [commands, setCommands] = useState<ReadonlyArray<Command>>([]);
  const [pending, setPending] = useState<ActionId>();

  keys.useAction('commands', () => {
    setCommands(
      actions.filter(
        (action) =>
          action.id !== 'commands' &&
          (action.state === 'active' || action.state === 'shadowed'),
      ),
    );
    openSurface('palette');
  });

  useEffect(() => {
    if (pending === undefined || surface === 'palette') return;
    run(pending);
    setPending(undefined);
  }, [pending, surface, run]);

  if (surface !== 'palette') return null;
  return (
    <Dialog
      commands={commands}
      onClose={() => closeSurface('palette')}
      onRun={(id) => {
        closeSurface('palette');
        setPending(id);
      }}
    />
  );
}

/**
 * The palette's dialog. Its input is Taken Over (`data-keys="enabled"`),
 * so the arrows, Ctrl N and P, Enter and Escape reach the palette's
 * Actions while letters still type.
 */
function Dialog(props: {
  readonly commands: ReadonlyArray<Command>;
  readonly onRun: (id: ActionId) => void;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const shown = props.commands.filter((command) =>
    command.description.toLowerCase().includes(query.toLowerCase()),
  );
  const chosen = shown[Math.min(index, shown.length - 1)];
  const list = useId();
  const rowId = (command: Command) => `${list}-${command.id}`;

  // Focus stays in the input, for typing; the chosen row scrolls into view
  // and the input points at it, as a combobox does.
  useEffect(() => {
    if (chosen === undefined) return;
    document
      .getElementById(rowId(chosen))
      ?.scrollIntoView({ block: 'nearest' });
  });

  keys.useAction('palette.down', () =>
    setIndex((i) => Math.min(i + 1, shown.length - 1)),
  );
  keys.useAction('palette.up', () => setIndex((i) => Math.max(i - 1, 0)));
  keys.useAction('palette.run', () => chosen && props.onRun(chosen.id), {
    enabled: chosen !== undefined,
  });
  keys.useAction('palette.close', props.onClose);

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center bg-black/40 pt-[15vh]">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-popover shadow-2xl ring-1 ring-edge">
        <input
          autoFocus
          data-keys="enabled"
          role="combobox"
          aria-expanded
          aria-controls={list}
          aria-activedescendant={chosen ? rowId(chosen) : undefined}
          value={query}
          placeholder="Run a command…"
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          className="w-full border-b border-border bg-transparent px-4 py-3 outline-none"
        />
        <ul id={list} role="listbox" className="max-h-80 overflow-y-auto p-1">
          {shown.map((command) => (
            <li
              key={command.id}
              id={rowId(command)}
              role="option"
              aria-selected={command === chosen}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => props.onRun(command.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm',
                  command === chosen && 'bg-accent',
                )}
              >
                {command.description}
                <span className="flex gap-2">
                  {command.bindings.map(({ binding }, i) => (
                    <BindingKeys key={i} binding={binding} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
