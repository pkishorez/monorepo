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
  FolderIcon,
  FolderPlusIcon,
} from 'lucide-react';
import { LayerHeader } from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { BindingKeys } from '@kestack/web-platform/ui/input';
import { bindingOf, describe } from '@kestack/use-keys';
import { revealInView } from '@kestack/use-keys/surfaces';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { keys } from '../../../../device/account/connections/layout/commands.ts';
import {
  finishedOn,
  Message,
  outcomeOf,
  settles,
  shownOf,
  type Choice,
  type Model,
  type Spec,
} from '../actor.ts';
import { MakeHere } from './make.tsx';
import { isLatest, useOpening } from '../shape/opening.ts';
import { useDrawn } from '../shape/shape.ts';

/*
 * The top Step, drawn by cmdk on the isolated `picker` Surface: the trail
 * of choices so far, the search, and the rows that match it, best first,
 * under their headings. The actor holds the query and the highlighted row;
 * cmdk only draws them. Every key is an Action of the Surface, taken before
 * cmdk hears it, so each can be rebound: Enter picks, Ctrl+L goes into
 * the row's next Step and never finishes, Mod+Enter finishes on it, the arrows
 * and Ctrl+N/Ctrl+P move, Ctrl+H or Backspace in an empty search goes back
 * a Step, and Escape clears the search, then leaves the Surface, which
 * closes it. Leaving it by a pick that finishes, or by finishing, is done
 * here, so the Surface goes back to where it was opened from, focus too,
 * or, for choices that take the app somewhere, on to the page;
 * so is leaving it when the owner drops the Picker while it is open, as it
 * does once it has settled a choice, unless another Picker was opened
 * since, which holds the Surface now. Opened by keys or a mouse, the
 * search is the Surface's default Focus Spot, so it takes focus as the
 * Picker opens. Rows that carry an Action's keys show them in two columns,
 * out of Vim Mode and in it, under heads that say so, the set in effect
 * lit and the other quieter; on a narrow screen, the name has its own line
 * and the set in effect sits under it, alone.
 *
 * Opened by touch, in a Drawer or a Sheet, a header names
 * the Step, with a button back to the one under it; the keys' hints are
 * gone, and so is the highlight, and rows still loading show a spinner in
 * the middle. Only a Sheet has a search, and not for a Step that says it
 * has none; a row is tapped to go into it. The keyboard moves no focus
 * there: the search waits to be tapped, and the Sheet then rises over the
 * on-screen keyboard. With no
 * Mod+Enter to finish with, a Step that finishes on itself has a button
 * at the top that does, under where the Step is, such as a folder's path.
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
  const { shape, label, held } = useDrawn();
  // Every Picker is the one Surface: one over this, leaving it, is no
  // closing of this while its owner holds it.
  const holding = useRef(held);
  holding.current = held;
  const touch = shape === 'drawer' || shape === 'sheet';
  // Opened by touch, nothing takes focus on its own.
  const search = keys.useFocusSpot('picker', 'search', { default: !touch });
  // A Drawer has no search: its rows are tapped through.
  const searched = !touch || (shape === 'sheet' && shown.search);
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
  // On the row `on`, or with null on the Step itself.
  const finish = (on: string | null) => {
    const ended = finishedOn(spec, model, props, on);
    if (ended === null) return;
    send({ _tag: 'Finished', on });
    if (!settles(spec, ended.model)) close(ended.choices);
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
  keys.useAction('picker.finish', () => finish(highlighted || null));
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
  const keyed = shown.rows.find((row) => row.keys !== undefined)?.keys;
  const trail = [
    ...model.choices.map((choice) => choice.label),
    ...(shown.title === null ? [] : [shown.title]),
  ];
  const back = () => send({ _tag: 'Back' });
  return (
    <keys.Surface
      id="picker"
      asChild
      onExit={() => {
        if (!holding.current) send({ _tag: 'Closed' });
      }}
    >
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
        className={cn(
          'rounded-none! bg-transparent',
          touch && 'min-h-0 flex-1',
        )}
      >
        {touch && (
          <LayerHeader
            // The Step's own name, else the choice that opened it, else the Picker's.
            title={shown.title ?? model.choices.at(-1)?.label ?? label}
            {...(model.below.length > 0 ? { onBack: back } : {})}
          />
        )}
        {touch && (shown.where !== null || shown.done !== null) && (
          <div className="flex shrink-0 flex-col gap-3 px-4 pb-3">
            {shown.where !== null && (
              <p className="truncate rounded-lg px-3 py-2.5 font-mono text-[13px] text-muted-foreground ring-1 ring-border">
                {shown.where}
              </p>
            )}
            {shown.make !== null ? (
              <MakeHere
                // Each Step starts with its buttons, the one made into too.
                key={`${model.below.length}:${model.step.key}`}
                label={shown.make}
                busy={model.busy}
                onMake={(name) => send({ _tag: 'Make', name })}
                done={
                  shown.done !== null && (
                    <Button
                      className="h-11 min-w-0 flex-1 text-[15px] active:scale-[0.98]"
                      disabled={finishedOn(spec, model, props, null) === null}
                      onClick={() => finish(null)}
                    >
                      {shown.done}
                    </Button>
                  )
                }
              />
            ) : (
              shown.done !== null && (
                <Button
                  className="h-11 w-full text-[15px]"
                  disabled={finishedOn(spec, model, props, null) === null}
                  onClick={() => finish(null)}
                >
                  {shown.done}
                </Button>
              )
            )}
          </div>
        )}
        {!touch && trail.length > 0 && (
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
                onClick={back}
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
        {searched && (
          <CommandInput
            ref={search}
            value={query}
            onValueChange={(next) => send({ _tag: 'Typed', query: next })}
            placeholder={shown.placeholder}
          />
        )}
        <CommandList
          ref={list}
          className={
            touch
              ? // Its rows' wrapper fills it, so what it says while empty sits in the middle.
                'max-h-none min-h-0 flex-1 overscroll-contain **:[[cmdk-list-sizer]]:flex **:[[cmdk-list-sizer]]:min-h-full **:[[cmdk-list-sizer]]:flex-col'
              : 'max-h-[min(22rem,55dvh)]'
          }
        >
          <CommandEmpty
            className={cn(
              shown.problem !== null && 'px-4 text-destructive',
              // On touch, in the middle of a list that keeps its height.
              touch &&
                'flex flex-1 flex-col items-center justify-center gap-3 py-16 text-base text-muted-foreground',
            )}
          >
            {shown.problem === null && shown.loading && touch && (
              <Spinner className="size-6" />
            )}
            {shown.problem ?? (shown.loading ? 'Loading…' : shown.empty)}
          </CommandEmpty>
          {keyed !== undefined && groups.length > 0 && (
            <div
              aria-hidden
              className="sticky top-0 z-10 flex justify-end gap-3 bg-popover px-3 pt-2 pb-1 text-[11px] text-muted-foreground max-sm:hidden"
            >
              <span
                className={cn(
                  'w-28 text-right',
                  keyed.on === 'out' && 'text-foreground',
                )}
              >
                Out of Vim Mode
              </span>
              <span
                className={cn(
                  'w-28 text-right',
                  keyed.on === 'vim' && 'text-foreground',
                )}
              >
                In Vim Mode
              </span>
            </div>
          )}
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
                  className={cn(
                    'items-start data-quiet:opacity-60',
                    entry.keys !== undefined && 'max-sm:flex-wrap',
                    // No room kept for a check a row does not have.
                    touch && 'data-[checked=false]:[&>svg:last-child]:hidden',
                  )}
                >
                  {entry.mark !== undefined && shown.mark !== null
                    ? shown.mark(
                        entry.mark,
                        cn('self-center', touch ? 'size-5!' : 'size-4!'),
                      )
                    : touch &&
                      (entry.icon ?? shown.icon) !== null && (
                        <RowIcon icon={entry.icon ?? shown.icon!} />
                      )}
                  <span
                    className={cn(
                      'flex min-w-0 flex-1 flex-col',
                      touch ? 'gap-1' : 'gap-0.5',
                      entry.keys !== undefined && 'max-sm:basis-full',
                    )}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="max-w-full shrink-0 truncate font-medium">
                        <Highlighted text={entry.label} matched={matched} />
                      </span>
                      {entry.hint !== undefined && (
                        <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground tabular-nums">
                          {entry.hint}
                        </span>
                      )}
                    </span>
                    {(entry.unavailable ?? entry.detail) !== undefined && (
                      <span
                        className={cn(
                          'truncate text-muted-foreground',
                          touch ? 'text-sm' : 'text-xs',
                        )}
                      >
                        {entry.unavailable ?? entry.detail}
                      </span>
                    )}
                  </span>
                  {entry.keys !== undefined && (
                    <span className="flex shrink-0 gap-3 self-center max-sm:self-start">
                      <Keys
                        written={entry.keys.out}
                        lit={entry.keys.on === 'out'}
                      />
                      <Keys
                        written={entry.keys.vim}
                        lit={entry.keys.on === 'vim'}
                      />
                    </span>
                  )}
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
        {!touch && (
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
        )}
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

/** One column of a row's keys, as written; a dash for none. */
function Keys({
  written,
  lit,
}: {
  readonly written: ReadonlyArray<string>;
  readonly lit: boolean;
}) {
  return (
    <span
      data-lit={lit}
      className={cn(
        'flex w-28 flex-wrap justify-end gap-1 max-sm:w-auto max-sm:justify-start',
        !lit && 'opacity-50 max-sm:hidden',
      )}
    >
      {written.length === 0 ? (
        <span className="text-muted-foreground/60">–</span>
      ) : (
        written.map((each) => (
          <BindingKeys key={each} binding={bindingOf(each)} always />
        ))
      )}
    </span>
  );
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

/**
 * What a row is, on touch: a folder in a square, or, for one that adds a
 * place, a plus in a filled one, so the action stands apart from what it
 * lists. A row's mark, such as an agent's logo, is its Step's to draw.
 */
function RowIcon({ icon }: { readonly icon: 'project' | 'folder' | 'add' }) {
  if (icon === 'add')
    return (
      <span className="grid size-9 shrink-0 place-items-center self-center rounded-[10px] bg-foreground text-background">
        <FolderPlusIcon aria-hidden className="size-4.5! text-background!" />
      </span>
    );
  return icon === 'project' ? (
    <span className="grid size-9 shrink-0 place-items-center self-center rounded-[10px] ring-1 ring-border">
      <FolderIcon aria-hidden className="size-4.5! text-muted-foreground!" />
    </span>
  ) : (
    <FolderIcon
      aria-hidden
      className="size-4! self-center text-muted-foreground!"
    />
  );
}
