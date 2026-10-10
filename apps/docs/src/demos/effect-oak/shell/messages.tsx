import { Fragment } from 'react';
import type { Ref } from 'react';
import { X } from 'lucide-react';
import type { Entry } from 'effect-oak';
import { Button } from '@kstackz/web-platform/components/button';
import { seconds } from './seconds.js';

const payloadOf = ({ _tag, ...payload }: { readonly _tag: string }) =>
  Object.keys(payload).length === 0 ? '' : JSON.stringify(payload);

/** Keep an element in sight, each time it is drawn. */
const inSight = (element: HTMLElement | null) =>
  element?.scrollIntoView({ block: 'nearest' });

/**
 * Every Message on a timeline, oldest first: when it arrived, where it went,
 * and what came of it. Picking one shows the app right after it. In Replay a
 * playhead marks the Step shown, and later Messages recede.
 */
export const Messages = ({
  log,
  shown,
  onShow,
  onClose,
}: {
  readonly log: ReadonlyArray<Entry>;
  readonly shown: number | null;
  readonly onShow: (step: number) => void;
  readonly onClose: () => void;
}) => {
  const reached = shown ?? log.length;
  const playhead = (
    <Playhead
      at={reached === 0 ? 0 : log[reached - 1]!.at}
      ref={(element) => {
        inSight(element);
      }}
    />
  );

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b pr-2 pl-4">
        <h2 className="text-sm font-medium">Messages</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close Messages"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {log.length === 0 ? (
        <p className="p-4 text-sm text-pretty text-muted-foreground">
          No Messages yet. Use the app and each one shows up here, with its
          Time.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto py-3">
          {shown === 0 && playhead}
          {log.map((entry, index) => (
            <Fragment key={index}>
              <Row
                entry={entry}
                later={index >= reached}
                onPick={() => onShow(index + 1)}
              />
              {shown !== null && shown === index + 1 && playhead}
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

/** The Step shown in Replay, right after its Message, with that Message's Time. */
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
              {entry.path}
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
