import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { Layer } from 'effect';
import { isMany } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki';
import { View, toReact } from '@kestack/kabuki/react';
import { CheckIcon, PlusIcon } from '@kestack/web-platform/components/lucide';
import { FILTERS, ROWS, TodoLive, TodosLive } from './todos.ts';

/*
 * kabuki's hero: one card, a real kabuki app on the left and, on the same
 * rows, the Actor each part of it is and the State it is in. A band marks
 * the row the last Message landed on. Under it, the app's History: a tick
 * per Message, to drag back through and forward again.
 *
 * The right column and the timeline do not look inside React. They read
 * the app's own History from its Runtime: every Message, and the Snapshot
 * right after any of them. React only draws the app on the left.
 */

/** Every row is this tall, in both columns, so they line up. */
const ROW = 'h-12';
const ROW_PX = 48;

/** Arriving: fast out of the gate, settling in. */
const ENTER = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;
/** A row growing in or folding away. */
const FOLD = { duration: 0.35, ease: [0.77, 0, 0.175, 1] } as const;
/** How long a completed to-do stays in Active before it folds away, in seconds. */
const LINGER = 0.45;
/** An indicator following what is current. */
const SPRING = { type: 'spring', duration: 0.35, bounce: 0 } as const;

/** Empty rows, ruled like full ones, under whatever the list shows. */
const ruled = {
  height: ROWS * ROW_PX,
  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ROW_PX - 1}px, color-mix(in oklab, var(--color-border) 60%, transparent) ${ROW_PX - 1}px ${ROW_PX}px)`,
};

/**
 * A row that grows in and folds away as the filter shows or hides it. One
 * that leaves because it changed, not because the filter did, waits long
 * enough for its tick to be seen first.
 */
function Fold({
  shown,
  filter,
  children,
}: {
  readonly shown: boolean;
  readonly filter: string;
  readonly children: ReactNode;
}) {
  const before = useRef(filter);
  useEffect(() => {
    before.current = filter;
  });
  const delay = shown || before.current !== filter ? 0 : LINGER;
  return (
    <motion.li
      aria-hidden={!shown}
      initial={{ height: 0, opacity: 0 }}
      animate={
        shown ? { height: ROW_PX, opacity: 1 } : { height: 0, opacity: 0 }
      }
      transition={{
        height: { ...FOLD, delay },
        opacity: { duration: shown ? 0.3 : 0.2, delay },
      }}
      className="overflow-hidden"
    >
      {children}
    </motion.li>
  );
}

// 1. The app, drawn by React

const TodoView = View.make(TodoLive, ({ _tag, model, props, send, root }) => {
  const done = _tag === 'Done';
  return (
    <Fold
      shown={props.filter === 'All' || props.filter === _tag}
      filter={props.filter}
    >
      <button
        {...root}
        type="button"
        onClick={() => send({ _tag: 'Toggled' })}
        aria-pressed={done}
        className={`${ROW} group flex w-full items-center gap-3 border-b border-border/60 bg-card px-5 text-left transition-colors duration-150 hover:bg-muted/50`}
      >
        <span
          className={`grid size-[18px] shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200 ease-out group-active:scale-[0.9] ${
            done
              ? 'border-foreground bg-foreground text-background'
              : 'border-muted-foreground/50 group-hover:border-foreground'
          }`}
        >
          <CheckIcon
            strokeWidth={3}
            className={`size-2.5 transition-[opacity,transform] duration-200 ease-out ${done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
          />
        </span>
        <span
          className={`relative min-w-0 truncate text-sm transition-colors duration-300 ${done ? 'text-muted-foreground' : ''}`}
        >
          {model.text}
          <span
            aria-hidden
            className={`absolute inset-x-0 top-1/2 h-px origin-left bg-muted-foreground transition-transform duration-300 ease-out ${done ? 'scale-x-100' : 'scale-x-0'}`}
          />
        </span>
      </button>
    </Fold>
  );
});

const TodosView = View.make(
  TodosLive,
  ({ _tag, model, children, send, root }) => (
    <div {...root}>
      <div
        className={`${ROW} flex items-center justify-between gap-3 border-b border-border px-5`}
      >
        <div className="flex rounded-md bg-muted p-0.5">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => send({ _tag: 'Filtered', to: filter })}
              aria-pressed={_tag === filter}
              className={`relative h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors duration-150 ${
                _tag === filter
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {_tag === filter && (
                <motion.span
                  layoutId="kabuki-hero-filter"
                  transition={SPRING}
                  className="absolute inset-0 rounded-[5px] bg-background shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                />
              )}
              <span className="relative">{filter}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => send({ _tag: 'Pressed' })}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.97]"
        >
          <PlusIcon className="size-3.5" />
          Add
        </button>
      </div>
      <ul style={ruled}>
        {model.ids.length === 0 && (
          <li
            className={`${ROW} flex items-center px-5 text-xs text-muted-foreground`}
          >
            Press Add for a to-do.
          </li>
        )}
        {children.todos.map((todo) => (
          <TodoView key={todo.key} instance={todo} />
        ))}
      </ul>
    </div>
  ),
);

const App = toReact(TodosLive, TodosView, Layer.empty, {
  name: 'kabuki:todos',
});

// 2. Its Actors, read from the Snapshot

/** Whether the list's filter shows a to-do, as the left column decides. */
const showing = (list: Instance, todo: Instance) =>
  list.state._tag === 'All' || todo.state._tag === list.state._tag;

function State({ children }: { readonly children: string }) {
  return (
    <span className="grid h-5 place-items-center overflow-hidden rounded-full border border-border bg-background px-2 font-mono text-[11px] text-foreground">
      <motion.span
        key={children}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={ENTER}
      >
        {children}
      </motion.span>
    </span>
  );
}

function Actors({
  root,
  todos,
}: {
  readonly root: Instance;
  readonly todos: ReadonlyArray<Instance>;
}) {
  return (
    <div className="hidden border-l border-border bg-muted/40 sm:block">
      <div
        className={`${ROW} flex items-center justify-between gap-2 border-b border-border px-4`}
      >
        <span className="font-mono text-xs text-muted-foreground">
          {root.actor}
        </span>
        <State>{root.state._tag}</State>
      </div>
      <ul style={ruled}>
        {todos.map((todo) => (
          <Fold
            key={todo.id}
            shown={showing(root, todo)}
            filter={root.state._tag}
          >
            <div
              className={`${ROW} flex items-center justify-between gap-2 border-b border-border/60 px-4`}
            >
              <span className="font-mono text-xs text-muted-foreground">
                {todo.actor}
              </span>
              <State>{todo.state._tag}</State>
            </div>
          </Fold>
        ))}
      </ul>
    </div>
  );
}

// 3. The History

function Timeline({
  count,
  at,
  label,
  live,
  onStep,
  onLive,
}: {
  readonly count: number;
  readonly at: number;
  /** The Message at this step. */
  readonly label: string;
  readonly live: boolean;
  readonly onStep: (step: number) => void;
  readonly onLive: () => void;
}) {
  // Where a step sits on the track: init at the start, the Head at the end.
  const place = (step: number) => `${count === 0 ? 0 : (step / count) * 100}%`;
  return (
    <div className="flex h-14 items-center gap-4 border-t border-border px-5">
      <button
        type="button"
        onClick={onLive}
        disabled={live}
        className="flex h-7 w-16 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border text-xs font-medium transition-colors duration-150 enabled:hover:bg-muted disabled:border-transparent"
      >
        <span
          className={`size-1.5 rounded-full transition-colors duration-150 ${live ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
        />
        Live
      </button>
      <div className="relative h-6 flex-1 rounded has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-foreground">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <motion.span
          className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-foreground"
          initial={false}
          animate={{ width: place(at) }}
          transition={SPRING}
        />
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={`absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 transition-colors duration-200 ${index < at ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
            style={{ left: place(index + 1) }}
          />
        ))}
        <motion.span
          aria-hidden
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card"
          initial={false}
          animate={{ left: place(at) }}
          transition={SPRING}
        />
        <input
          type="range"
          aria-label="Step through the app's History"
          aria-valuetext={label}
          min={0}
          max={count}
          value={at}
          onChange={(event) => onStep(Number(event.target.value))}
          disabled={count === 0}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>
      <span className="flex w-20 shrink-0 flex-col items-end font-mono text-[11px] leading-tight tabular-nums">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {at} / {count}
        </span>
      </span>
    </div>
  );
}

// 4. The card

export function Hero() {
  const { history, branch, head, shown, show } = App.useRuntime();
  // Step 0 is right after init; step n right after the nth Message.
  const at =
    shown === null
      ? branch.length
      : shown === 'init'
        ? 0
        : branch.findIndex((entry) => entry.id === shown) + 1;
  const showStep = (step: number) =>
    show(
      step === branch.length
        ? null
        : step === 0
          ? 'init'
          : branch[step - 1]!.id,
    );
  const drawn = history.snapshotAt(
    shown === null ? head : shown === 'init' ? null : shown,
  );
  const held = drawn.children['todos'];
  const todos = held !== undefined && isMany(held) ? held : [];
  // The row the Message at this step landed on: 0 for the list, then each to-do.
  const landed = at === 0 ? undefined : branch[at - 1];
  const band =
    landed?.destination === drawn.id
      ? 0
      : todos
          .filter((todo) => showing(drawn, todo))
          .findIndex((todo) => todo.id === landed?.destination) + 1 ||
        undefined;

  return (
    <MotionConfig reducedMotion="user">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.08)]">
        <div className="relative grid sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-foreground/[0.05] transition-[transform,opacity] duration-200 ease-out"
            style={{
              height: ROW_PX,
              transform: `translateY(${(band ?? 0) * ROW_PX}px)`,
              opacity: band === undefined ? 0 : 1,
            }}
          />
          <div inert={shown !== null}>
            <App />
          </div>
          <Actors root={drawn} todos={todos} />
        </div>
        <Timeline
          count={branch.length}
          at={at}
          label={landed?.message._tag ?? 'init'}
          live={shown === null}
          onStep={showStep}
          onLive={() => show(null)}
        />
      </div>
    </MotionConfig>
  );
}
