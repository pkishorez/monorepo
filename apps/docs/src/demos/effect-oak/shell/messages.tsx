import { Fragment } from 'react';
import type { Ref } from 'react';
import { GitBranch, X } from 'lucide-react';
import type { Entry } from 'effect-oak';
import { Button } from '@kstackz/web-platform/components/button';
import { seconds } from './seconds.js';

const payloadOf = ({ _tag, ...payload }: { readonly _tag: string }) =>
  Object.keys(payload).length === 0 ? '' : JSON.stringify(payload);

/** Keep an element in sight, each time it is drawn. */
const inSight = (element: HTMLElement | null) =>
  element?.scrollIntoView({ block: 'nearest' });

/**
 * Every Message on the Branch in view, oldest first: when it arrived, where it
 * went, and what came of it. Picking one shows the app right after it. Where
 * another Branch splits off, a line lists where it starts; picking one walks
 * that Branch instead. In Replay a playhead marks the entry shown, and later
 * Messages recede.
 */
export const Messages = ({
  branch,
  shown,
  children,
  onShow,
  onBranch,
  onHeadBranch,
  onClose,
}: {
  readonly branch: ReadonlyArray<Entry>;
  readonly shown: number | null;
  readonly children: (entry: number | null) => ReadonlyArray<Entry>;
  readonly onShow: (entry: number) => void;
  /** Walk the Branch through `child`, which follows the entry at `index` (-1: init). */
  readonly onBranch: (index: number, child: Entry) => void;
  /** Back to the Head's Branch, when another is in view. */
  readonly onHeadBranch: (() => void) | undefined;
  readonly onClose: () => void;
}) => {
  const found = branch.findIndex((entry) => entry.id === shown);
  const reached = shown === null || found === -1 ? branch.length : found + 1;
  const splits = (index: number) => {
    const others = children(index === -1 ? null : branch[index]!.id).filter(
      (child) => child.id !== branch[index + 1]?.id,
    );
    return others.length === 0 ? null : (
      <Split others={others} onPick={(child) => onBranch(index, child)} />
    );
  };

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
        <h2 className="text-sm font-medium">Messages</h2>
        <div className="flex items-center gap-1">
          {onHeadBranch && (
            <Button size="sm" variant="ghost" onClick={onHeadBranch}>
              Head&apos;s Branch
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close Messages"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      {branch.length === 0 ? (
        <p className="p-4 text-sm text-pretty text-muted-foreground">
          No Messages yet. Use the app and each one shows up here, with its
          Time.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto py-3">
          {splits(-1)}
          {branch.map((entry, index) => (
            <Fragment key={entry.id}>
              <Row
                entry={entry}
                later={index >= reached}
                onPick={() => onShow(entry.id)}
              />
              {shown !== null && reached === index + 1 && (
                <Playhead
                  at={entry.at}
                  ref={(element) => {
                    inSight(element);
                  }}
                />
              )}
              {splits(index)}
            </Fragment>
          ))}
          {shown === null && (
            <li
              ref={(element) => {
                inSight(element);
              }}
              aria-hidden
            />
          )}
        </ol>
      )}
    </>
  );
};

/** Where other Branches split off: the first Message of each, to walk it. */
const Split = ({
  others,
  onPick,
}: {
  readonly others: ReadonlyArray<Entry>;
  readonly onPick: (child: Entry) => void;
}) => (
  <li className="grid grid-cols-[4.5rem_1rem_1fr] items-center py-0.5">
    <span />
    <GitBranch className="mx-auto size-3 text-muted-foreground" aria-hidden />
    <span className="flex min-w-0 flex-wrap gap-1 pr-2 pl-2">
      {others.map((child) => (
        <button
          key={child.id}
          type="button"
          onClick={() => onPick(child)}
          className="truncate rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          Branch: {child.message._tag} · {seconds(child.at)}
        </button>
      ))}
    </span>
  </li>
);

/** The entry shown in Replay, right after its Message, with that Message's Time. */
const Playhead = ({
  at,
  ref,
}: {
  readonly at: number;
  readonly ref: Ref<HTMLLIElement>;
}) => (
  <li
    ref={ref}
    aria-label={`Showing ${seconds(at)}`}
    className="grid grid-cols-[4.5rem_1rem_1fr] items-center py-1"
  >
    <span className="pr-2 text-right font-mono text-xs text-primary tabular-nums">
      {seconds(at)}
    </span>
    <span className="mx-auto size-2 rotate-45 bg-primary" />
    <span className="mr-4 h-px bg-primary/50" />
  </li>
);

/** One Message: its Time, a dot on the rail, and what it did. */
const Row = ({
  entry,
  later,
  onPick,
}: {
  readonly entry: Entry;
  readonly later: boolean;
  readonly onPick: () => void;
}) => {
  const payload = payloadOf(entry.message);
  const transition = entry.outcome === 'handled' && entry.from !== entry.to;
  const missed = entry.outcome !== 'handled';
  return (
    <li className={`flex ${later ? 'opacity-40' : ''}`}>
      <button
        type="button"
        onClick={onPick}
        className="group grid w-full grid-cols-[4.5rem_1rem_1fr] text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="pt-2 pr-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {seconds(entry.at)}
        </span>
        <span className="relative flex justify-center">
          <span className="absolute inset-y-0 w-px bg-border" />
          <span
            className={`relative mt-3 size-2 rounded-full ${
              transition
                ? 'bg-primary'
                : missed
                  ? 'border border-muted-foreground bg-background'
                  : 'bg-muted-foreground'
            }`}
          />
        </span>
        <span className="mr-2 flex min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors duration-150 group-hover:bg-muted/60">
          <span className="flex items-baseline gap-2">
            <span
              className={`text-sm font-medium ${missed ? 'text-muted-foreground line-through' : ''}`}
            >
              {entry.message._tag}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {entry.instance}
            </span>
          </span>
          {transition && (
            <span className="text-xs text-primary">
              {entry.from} → {entry.to}
            </span>
          )}
          {entry.outcome === 'ignored' && (
            <span className="text-xs text-muted-foreground">
              Ignored: {entry.from} has no rule for it
            </span>
          )}
          {entry.outcome === 'dropped' && (
            <span className="text-xs text-muted-foreground">
              Dropped: its Node was already gone
            </span>
          )}
          {payload && (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {payload}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};
