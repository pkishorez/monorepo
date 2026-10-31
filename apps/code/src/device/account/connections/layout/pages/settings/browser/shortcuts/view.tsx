import { View } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/view';
import { bindingOf, describe, shortcutOf } from '@kestack/use-keys';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { CircleAlertIcon, SearchIcon } from 'lucide-react';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { BindingKeys } from '@kestack/web-platform/ui/input';
import { keys } from '../../../../commands.ts';
import { Title } from '../../../../../../../../ui/controls/settings/index.ts';
import { ShortcutsLive } from './actor.ts';
import { actionOf, keysOf, search, shadowsOf, swapped } from './bindings.ts';

/*
 * Every Action and its keys as the key table lists them (`layout/commands.ts`): one
 * row per thing done, in sections, its keys beside it, and its Vim Mode
 * ones too while Vim Mode is on; off, what only Vim Mode does is left
 * out. Under a search field.
 * Each Action's keys are a button: clicking it records one key press in its place,
 * on the isolated `record` Surface, where no key of the app works; the
 * element itself takes the key, so the browser does nothing with it
 * either. Escape, or a click away, leaves the Surface, which stops
 * recording; focus goes back to the row. Settings has no keys of its own:
 * it is worked by pointer and Tab.
 */

type Self = ViewProps<typeof ShortcutsLive>;
type Model = Self['model'];
type Bindings = NonNullable<Model['bindings']>;

const list = new Intl.ListFormat('en', { type: 'conjunction' });

function Keys({ written }: { readonly written: ReadonlyArray<string> }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {written.map((each) => (
        <BindingKeys key={each} binding={bindingOf(each)} always />
      ))}
    </span>
  );
}

/** Where a key is recorded: drawn while its row records, on the `record` Surface. */
function Recorder({
  label,
  send,
}: {
  readonly label: string;
  readonly send: Self['send'];
}) {
  const { leave } = keys.useKeyboard();
  const spot = keys.useFocusSpot('record', 'key', { default: true });
  return (
    <keys.Surface id="record" asChild onExit={() => send({ _tag: 'Stopped' })}>
      <span
        ref={spot}
        tabIndex={0}
        aria-label={`Press the new key for ${label}, or Escape to keep it`}
        onBlur={() => leave('record')}
        onKeyDown={(event) => {
          // Escape is the keyboard's: it leaves the Surface, which stops recording.
          const bare =
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey;
          if ((event.key === 'Escape' && bare) || event.nativeEvent.isComposing)
            return;
          event.preventDefault();
          const pressed = shortcutOf(event);
          // A modifier alone: wait for the key it holds.
          if (pressed === null) return;
          send({ _tag: 'Pressed', keys: describe(pressed) });
          leave('record');
        }}
        className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground ring-2 ring-ring outline-none"
      >
        Press a key…
      </span>
    </keys.Surface>
  );
}

function Key({
  id,
  model,
  bindings,
  send,
}: {
  readonly id: string;
  readonly model: Model;
  readonly bindings: Bindings;
  readonly send: Self['send'];
}) {
  const { enter } = keys.useKeyboard();
  const spot = keys.useFocusSpot('content', `shortcut ${id}`);
  const action = actionOf(id);
  if (action === undefined) return null;
  const written = keysOf(bindings, id);
  const custom = bindings[id] !== undefined;
  return (
    <span className="inline-flex items-center gap-1">
      {custom && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={`Reset ${action.label} to its default keys`}
          onClick={() => send({ _tag: 'Reset', id })}
          className="text-muted-foreground"
        >
          Reset
        </Button>
      )}
      {model.recording === id ? (
        <Recorder label={action.label} send={send} />
      ) : action.recordable ? (
        <button
          ref={spot}
          type="button"
          aria-label={`Change the keys for ${action.label}`}
          title={`${action.label}: click, then press the new key`}
          onClick={() => {
            send({ _tag: 'Record', id });
            enter('record');
          }}
          className="focus-ring -my-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted active:bg-muted"
        >
          <Keys written={written} />
        </button>
      ) : (
        <span
          title="Keys pressed in turn keep their defaults"
          className="px-1.5"
        >
          <Keys written={written} />
        </span>
      )}
    </span>
  );
}

/** What is said under a row of one of its Actions: a clash, a key that types, what was reset with it, what a nearer Surface does with its keys. */
function Notes({
  id,
  model,
  bindings,
  shadow,
  send,
}: {
  readonly id: string;
  readonly model: Model;
  readonly bindings: Bindings;
  readonly shadow: { readonly by: string; readonly keys: string } | undefined;
  readonly send: Self['send'];
}) {
  const clash = model.clash?.id === id ? model.clash : null;
  const holder = clash === null ? undefined : actionOf(clash.holder);
  const canSwap = clash !== null && swapped(bindings, clash) !== null;
  const by = shadow === undefined ? undefined : actionOf(shadow.by);
  return (
    <>
      {clash !== null && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-destructive">
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            <BindingKeys binding={bindingOf(clash.keys)} always />
            <span>
              is already “{holder?.label ?? clash.holder}” here.
              {!canSwap && ' Swapping would clash with another action.'}
            </span>
          </span>
          <span className="flex gap-1.5">
            {canSwap && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => send({ _tag: 'Swap' })}
              >
                Swap their keys
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => send({ _tag: 'Dismiss' })}
            >
              Keep mine
            </Button>
          </span>
        </div>
      )}
      {model.types?.id === id && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-1.5 text-xs text-destructive"
        >
          <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
          <BindingKeys binding={bindingOf(model.types.keys)} always />
          <span>
            would type in a text field, and this works while typing. Hold Ctrl,
            Alt or ⌘ with it.
          </span>
        </p>
      )}
      {model.alsoReset?.id === id && (
        <p role="status" className="text-xs text-muted-foreground">
          Also reset{' '}
          {list.format(
            model.alsoReset.also.map(
              (each) => `“${actionOf(each)?.label ?? each}”`,
            ),
          )}
          , whose keys its defaults would have clashed with.
        </p>
      )}
      {clash === null && shadow !== undefined && by !== undefined && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          In the {by.group.name},
          <BindingKeys binding={bindingOf(shadow.keys)} always />
          does “{by.label}” instead.
        </p>
      )}
    </>
  );
}

export const ShortcutsView = View.make(
  ShortcutsLive,
  ({ root, model, send }) => {
    const { bindings, query } = model;
    return (
      <section
        {...root}
        aria-labelledby="shortcuts"
        className="flex flex-col gap-6"
      >
        <Title
          id="shortcuts"
          name="Shortcuts"
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bindings === null || Object.keys(bindings).length === 0}
              onClick={() => send({ _tag: 'ResetAll' })}
            >
              Reset all
            </Button>
          }
        >
          Click a shortcut, then press the new keys.
        </Title>
        <div className="relative">
          <label htmlFor="shortcut-search" className="sr-only">
            Search shortcuts
          </label>
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="shortcut-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by action or key"
            value={query}
            onChange={(event) =>
              send({ _tag: 'Searched', query: event.currentTarget.value })
            }
            className="pl-8 text-base md:text-sm"
          />
        </div>
        {bindings === null ? (
          <div className="flex flex-col gap-2" aria-busy>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <Table model={model} bindings={bindings} send={send} />
        )}
      </section>
    );
  },
);

function Table({
  model,
  bindings,
  send,
}: {
  readonly model: Model;
  readonly bindings: Bindings;
  readonly send: Self['send'];
}) {
  const { vim } = keys.useKeyboard();
  const shadows = shadowsOf(bindings);
  // Vim Mode off, what only it does is left out.
  const found = search(bindings, model.query).flatMap((section) => {
    const rows = vim.on
      ? section.rows
      : section.rows.filter((row) => row.always.length > 0);
    return rows.length === 0 ? [] : [{ ...section, rows }];
  });
  const columns = vim.on ? COLUMNS : COLUMN;
  if (found.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No action or key matches “{model.query.trim()}”.
      </p>
    );
  return (
    <div className="flex flex-col">
      <div
        aria-hidden
        className={`${columns} border-b border-border/60 px-2 pb-1.5 text-xs font-medium text-muted-foreground`}
      >
        <span>Action</span>
        <span>Shortcut</span>
        {vim.on && <span>Vim mode</span>}
      </div>
      {found.map((section) => (
        <div
          key={section.title}
          role="group"
          aria-labelledby={`shortcuts-${section.title}`}
          className="flex flex-col"
        >
          <h3
            id={`shortcuts-${section.title}`}
            className="px-2 pt-5 pb-1 text-xs font-medium text-muted-foreground"
          >
            {section.title}
          </h3>
          <ul className="flex flex-col">
            {section.rows.map((row) => (
              <li
                key={row.label}
                className="flex flex-col gap-1.5 border-b border-border/60 px-2 py-1.5 last:border-b-0"
              >
                <div className={`${columns} min-h-8`}>
                  <span className="text-sm">{row.label}</span>
                  <Cell
                    ids={row.always}
                    model={model}
                    bindings={bindings}
                    send={send}
                  />
                  {vim.on && (
                    <Cell
                      ids={row.vim}
                      model={model}
                      bindings={bindings}
                      send={send}
                    />
                  )}
                </div>
                {[...row.always, ...(vim.on ? row.vim : [])].map((id) => (
                  <Notes
                    key={id}
                    id={id}
                    model={model}
                    bindings={bindings}
                    shadow={shadows.get(id)}
                    send={send}
                  />
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The table's three columns: what is done, then its keys in either Mode, then in Vim Mode. */
const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)_minmax(0,9rem)] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]';

/** Its two, out of Vim Mode: what is done, then its keys. */
const COLUMN =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]';

/** One column of a row: each Action's keys, a button that records new ones; a dash for none. */
function Cell({
  ids,
  model,
  bindings,
  send,
}: {
  readonly ids: ReadonlyArray<string>;
  readonly model: Model;
  readonly bindings: Bindings;
  readonly send: Self['send'];
}) {
  if (ids.length === 0)
    return <span className="text-sm text-muted-foreground/60">–</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {ids.map((id) => (
        <Key key={id} id={id} model={model} bindings={bindings} send={send} />
      ))}
    </span>
  );
}
