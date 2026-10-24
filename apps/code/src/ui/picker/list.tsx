import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/ui/components/command';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { describe } from '@kestack/use-keys';
import { revealInView } from '@kestack/use-keys/surfaces';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { keys } from '../../keys.ts';
import {
  finishes,
  finishingWith,
  Message,
  outcomeOf,
  settles,
  shownOf,
  type Choice,
  type Model,
  type Spec,
} from './actor.ts';
import { isLatest, useOpening } from './opening.ts';

/*
 * The top Step, drawn by cmdk on the isolated `picker` Surface: the trail
 * of choices so far, the search, and the rows that match it, best first,
 * under their headings. The actor holds the query and the highlighted row;
 * cmdk only draws them. Every key is an Action of the Surface, taken before
 * cmdk hears it, so each can be rebound: Enter picks, Ctrl+L goes into
 * the row's next Step and never finishes, Mod+Enter finishes, the arrows
 * and Ctrl+N/Ctrl+P move, Ctrl+H or Backspace in an empty search goes back
 * a Step, and Escape clears the search, then leaves the Surface, which
 * closes it. Leaving it by a pick that finishes, or by finishing, is done
 * here, so the Surface goes back to where it was opened from, focus too,
 * or, for choices that take the app somewhere, on to the page;
 * so is leaving it when the owner drops the Picker while it is open, as it
 * does once it has settled a choice, unless another Picker was opened
 * since, which holds the Surface now.
 */

// The keys cmdk picks and moves with, which are the Surface's to decide.
const CMDK_KEYS = new Set(['Enter', 'ArrowDown', 'ArrowUp']);

type Self<P> = {
  readonly model: Model;
  readonly props: P;
  readonly send: (message: typeof Message.Type) => void;
};

export function List<P>({
  spec,
  model,
  props,
  send,
}: Self<P> & { readonly spec: Spec<P> }) {
  const shown = shownOf(spec, model, props);
  const { query, highlighted } = model.step;
  const { enter, leave } = keys.useKeyboard();
  const search = keys.useFocusSpot('picker', 'search', { default: true });
  const close = (choices: ReadonlyArray<Choice>) => {
    leave('picker');
    if (spec.lands?.(choices) === true) enter('content');
  };
  const canBack = query === '' && model.below.length > 0;
  const waits = settles(spec, model);
  const pick = (value: string) => {
    const outcome = outcomeOf(spec, model, props, value);
    if (outcome._tag === 'None') return;
    send({ _tag: 'Picked', value });
    if (outcome._tag === 'Finish' && !waits)
      close([...model.choices, outcome.choice]);
  };
  const finish = () => {
    if (!finishes(spec, model, props)) return;
    send({ _tag: 'Finished' });
    if (!waits) close(finishingWith(spec, model, props));
  };
  // A choice the owner settled finishes once taken: leaving the Surface
  // closes it, and then the owner hears.
  useEffect(() => {
    if (!model.taken) return;
    leave('picker');
    if (spec.lands?.(model.choices) === true) enter('content');
  }, [model.taken, model.choices, spec, leave, enter]);
  const into = () => {
    if (outcomeOf(spec, model, props, highlighted)._tag === 'Next')
      send({ _tag: 'Picked', value: highlighted });
  };
  keys.useAction('picker.clear', () => send({ _tag: 'Typed', query: '' }), {
    enabled: query !== '',
  });
  keys.useAction('picker.back', () => send({ _tag: 'Back' }), {
    enabled: canBack,
  });
  keys.useAction('picker.pick', () => pick(highlighted));
  keys.useAction('picker.into', into);
  keys.useAction('picker.finish', finish);
  keys.useAction('picker.next', () => send({ _tag: 'Moved', by: 1 }));
  keys.useAction('picker.previous', () => send({ _tag: 'Moved', by: -1 }));
  const hint = useHints();

  // Dropped by its owner while open, it still leaves its Surface, so the
  // keyboard is never left in a Picker no one draws; but not once another
  // Picker has been opened, which holds the Surface now.
  const opening = useOpening();
  const finished = useRef(model.finished);
  useLayoutEffect(() => {
    finished.current = model.finished;
  });
  useEffect(
    () => () => {
      if (!finished.current && isLatest(opening)) leave('picker');
    },
    [leave, opening],
  );

  // Rows from the Props change with no Message: a highlight on the best
  // row, or on one no longer shown, moves to the best one.
  const values = shown.groups
    .flatMap(({ rows }) => rows)
    .filter(({ entry }) => entry.unavailable === undefined)
    .map(({ entry }) => entry.value);
  const first = values[0] ?? '';
  const wasFirst = useRef(first);
  const best =
    values.includes(highlighted) && highlighted !== wasFirst.current
      ? highlighted
      : first;
  useEffect(() => {
    wasFirst.current = first;
    if (best !== highlighted) send({ _tag: 'Highlighted', value: best });
  }, [first, best, highlighted, send]);

  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    revealInView(
      [...(list.current?.querySelectorAll('[cmdk-item]') ?? [])].find(
        (item) => item.getAttribute('data-value') === highlighted,
      ),
    );
  }, [highlighted]);

  const { groups } = shown;
  const trail = [
    ...model.choices.map(({ label }) => label),
    ...(shown.title === null ? [] : [shown.title]),
  ];
  return (
    <keys.Surface id="picker" asChild onExit={() => send({ _tag: 'Closed' })}>
      <Command
        // Taken Over: the Surface's Actions hear every key before cmdk.
        data-keys="enabled"
        shouldFilter={false}
        vimBindings={false}
        value={highlighted}
        onValueChange={(value) => send({ _tag: 'Highlighted', value })}
        // What the Actions left, cmdk would still pick or move with.
        onKeyDown={(event) => {
          if (CMDK_KEYS.has(event.key)) event.preventDefault();
        }}
        className="rounded-none! bg-transparent max-md:min-h-0 max-md:flex-1"
      >
        {trail.length > 0 && (
          <nav
            aria-label="Chosen so far"
            className="flex min-w-0 items-center gap-1 px-2 pt-1 pb-1.5 text-xs text-muted-foreground"
          >
            {model.below.length > 0 && (
              <button
                type="button"
                aria-label="Back"
                title={
                  hint('picker.back') ? `Back (${hint('picker.back')})` : 'Back'
                }
                onClick={() => send({ _tag: 'Back' })}
                className="focus-ring -ml-1 grid size-5 shrink-0 place-items-center rounded-sm hover:bg-muted hover:text-foreground"
              >
                <ChevronLeftIcon aria-hidden className="size-3.5" />
              </button>
            )}
            {trail.map((label, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <ChevronRightIcon
                    aria-hidden
                    className="size-3 shrink-0 opacity-60"
                  />
                )}
                <span
                  className={`truncate ${index === trail.length - 1 ? 'text-foreground' : ''}`}
                >
                  {label}
                </span>
              </Fragment>
            ))}
          </nav>
        )}
        <CommandInput
          ref={search}
          value={query}
          onValueChange={(next) => send({ _tag: 'Typed', query: next })}
          placeholder={shown.placeholder}
          // 16px on a phone, or iOS zooms in as it is focused.
          className="max-md:text-base"
        />
        <CommandList
          ref={list}
          className="max-h-[min(22rem,55dvh)] max-md:max-h-none max-md:flex-1"
        >
          <CommandEmpty
            className={
              shown.problem !== null ? 'px-4 text-destructive' : undefined
            }
          >
            {shown.problem ?? (shown.loading ? 'Loading…' : shown.empty)}
          </CommandEmpty>
          {groups.map(({ heading, rows }) => (
            <CommandGroup key={heading} heading={heading || undefined}>
              {rows.map(({ entry, matched }) => (
                <CommandItem
                  key={entry.value}
                  value={entry.value}
                  disabled={entry.unavailable !== undefined}
                  data-checked={entry.checked === true}
                  data-quiet={entry.quiet === true || undefined}
                  title={entry.unavailable}
                  onSelect={() => pick(entry.value)}
                  className="items-start data-quiet:opacity-60"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-medium">
                        <Highlighted text={entry.label} matched={matched} />
                      </span>
                      {entry.hint !== undefined && (
                        <span className="ml-auto truncate text-xs text-muted-foreground tabular-nums">
                          {entry.hint}
                        </span>
                      )}
                    </span>
                    {(entry.unavailable ?? entry.detail) !== undefined && (
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.unavailable ?? entry.detail}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {groups.length > 0 && shown.problem !== null && (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {shown.problem}
            </p>
          )}
          {groups.length > 0 && shown.problem === null && shown.loading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          )}
          {model.busy && (
            <p
              role="status"
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              Working…
            </p>
          )}
        </CommandList>
        <p
          aria-hidden
          className="flex gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground touch:hidden keyboard:flex"
        >
          <span>{hint('picker.pick')} pick</span>
          <span>{hint('picker.finish')} done</span>
          {canBack && <span>{hint('picker.back')} back</span>}
          <span className="ml-auto">
            {query === '' ? 'esc close' : `${hint('picker.clear')} clear`}
          </span>
        </p>
      </Command>
    </keys.Surface>
  );
}

/** The first keys of each Picker Action as bound now, as people write them. */
function useHints() {
  const available = keys.useAvailableActions();
  return (id: string) => {
    const [first] = available.find((action) => action.id === id)?.keys ?? [];
    return first === undefined ? null : describe(first);
  };
}

function Highlighted({
  text,
  matched,
}: {
  readonly text: string;
  readonly matched: ReadonlyArray<number>;
}) {
  if (matched.length === 0) return text;
  const at = new Set(matched);
  return [...text].map((letter, index) =>
    at.has(index) ? (
      <span
        key={index}
        className="text-foreground underline underline-offset-2"
      >
        {letter}
      </span>
    ) : (
      letter
    ),
  );
}
