import { Search } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import {
  type ActionId,
  BindingKeys,
  GESTURES,
  keys,
  useCommand,
} from '../../../commands/index.ts';

type Status = ReturnType<typeof keys.useStatus>;

/** A Command the palette can run: an Action that worked where it opened. */
type Found = Status['actions'][number];

/**
 * The palette, whole: the key that opens it, the dialog shown while its
 * Surface is Active, and closing it back to whoever opened it. It lists
 * every Command that worked where it opened, and runs the chosen one once
 * the Surface it came from is back.
 */
export function Palette() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const [found, setFound] = useState<ReadonlyArray<Found>>([]);
  const [pending, setPending] = useState<ActionId>();

  useCommand('openPalette', () => {
    setFound(
      actions.filter(
        (action) =>
          action.id !== 'openPalette' &&
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

  return (
    <AnimatePresence>
      {surface === 'palette' && (
        <Dialog
          found={found}
          onClose={() => closeSurface('palette')}
          onRun={(id) => {
            closeSurface('palette');
            setPending(id);
          }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * The palette's dialog. Its input is Taken Over (`data-keys="enabled"`),
 * so the arrows, Ctrl N and P, Enter and Escape reach the palette's
 * Commands while letters still type.
 */
function Dialog(props: {
  readonly found: ReadonlyArray<Found>;
  readonly onRun: (id: ActionId) => void;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const shown = props.found.filter((command) =>
    command.description.toLowerCase().includes(query.toLowerCase()),
  );
  const chosen = shown[Math.min(index, shown.length - 1)];
  const list = useId();
  const rowId = (command: Found) => `${list}-${command.id}`;

  useEffect(() => {
    if (chosen === undefined) return;
    document
      .getElementById(rowId(chosen))
      ?.scrollIntoView({ block: 'nearest' });
  });

  useCommand('palette.down', () =>
    setIndex((i) => Math.min(i + 1, shown.length - 1)),
  );
  useCommand('palette.up', () => setIndex((i) => Math.max(i - 1, 0)));
  keys.useAction('palette.run', () => chosen && props.onRun(chosen.id), {
    enabled: chosen !== undefined,
  });
  useCommand('palette.close', props.onClose);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[14vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      onClick={(event) =>
        event.target === event.currentTarget && props.onClose()
      }
    >
      <motion.div
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
        initial={{ opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            data-keys="enabled"
            role="combobox"
            aria-expanded
            aria-controls={list}
            aria-activedescendant={chosen ? rowId(chosen) : undefined}
            value={query}
            placeholder="What would you like to do?"
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            className="h-12 w-full bg-transparent outline-none"
          />
        </div>
        <ul id={list} role="listbox" className="max-h-96 overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No command by that name here.
            </li>
          )}
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
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm',
                  command === chosen && 'bg-accent',
                )}
              >
                <span className="grid">
                  <span>{command.description}</span>
                  {GESTURES[command.id] && (
                    <span className="hidden text-xs text-muted-foreground gestures:inline">
                      {GESTURES[command.id]}
                    </span>
                  )}
                </span>
                <span className="flex gap-2">
                  {command.bindings.map(({ binding }, i) => (
                    <BindingKeys key={i} binding={binding} always />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
