import {
  type CSSProperties,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  ArrowDownIcon,
  CheckIcon,
  CircleIcon,
  PauseIcon,
  XIcon,
} from 'lucide-react';
import type { Event, Video } from '../../../../video/library/schema.ts';
import {
  currentOf,
  logLines,
  marksOf,
  textOf,
  type Mark,
} from '../../format/index.ts';

/*
 * A Video while it works, or after it stopped or failed: a mark per step
 * (on a phone, the step under way and its place among them), kept under
 * the app bar as the page scrolls; what stopped it; and the log as
 * `ke-video logs` prints it, long lines wrapped, following the end unless
 * scrolled up. The log fills what the steps leave of the screen, so its
 * "Latest" stays in view.
 */

function MarkIcon({ mark }: { readonly mark: Mark }) {
  switch (mark) {
    case 'done':
      return <CheckIcon className="size-4 text-positive" />;
    case 'running':
      return <Spinner className="size-4 text-running" />;
    case 'stopped':
      return <PauseIcon className="size-4 text-muted-foreground" />;
    case 'failed':
      return <XIcon className="size-4 text-destructive" />;
    case 'pending':
      return <CircleIcon className="size-4 text-border" />;
  }
}

const BAR: Readonly<Record<Mark, string>> = {
  done: 'bg-positive',
  running: 'bg-running',
  stopped: 'bg-muted-foreground',
  failed: 'bg-destructive',
  pending: 'bg-positive',
};

const filledOf = (video: Video, mark: Mark) =>
  mark === 'done' ? 1 : mark === 'pending' ? 0 : (video.progress ?? 0);

/** The step under way and its place among them, over a bar per step. */
function Compact({ video }: { readonly video: Video }) {
  const current = currentOf(video);
  const percent =
    current.mark === 'pending' ||
    current.mark === 'done' ||
    video.progress === null
      ? null
      : `${Math.round(video.progress * 100)}%`;
  return (
    <div className="space-y-2 md:hidden">
      <p className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <MarkIcon mark={current.mark} />
          <span className="truncate">{current.step}</span>
          {percent && (
            <span className="text-muted-foreground tabular-nums">
              {percent}
            </span>
          )}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {current.place} of {current.of}
        </span>
      </p>
      <div className="flex gap-1" aria-hidden>
        {marksOf(video).map(({ step, mark }) => (
          <div
            key={step}
            className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${BAR[mark]}`}
              style={{ width: `${Math.round(filledOf(video, mark) * 100)}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Steps({ video }: { readonly video: Video }) {
  return (
    <ol className="hidden grid-cols-8 gap-x-3 md:grid">
      {marksOf(video).map(({ step, mark }) => {
        const filled = filledOf(video, mark);
        return (
          <li
            key={step}
            className="min-w-0 space-y-2"
            aria-label={`${step}: ${mark}`}
          >
            <div className="flex items-center gap-1.5">
              <MarkIcon mark={mark} />
              <span
                className={`truncate text-sm ${mark === 'pending' ? 'text-muted-foreground' : ''}`}
              >
                {step}
              </span>
            </div>
            <div className="h-0.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${BAR[mark]}`}
                style={{ width: `${Math.round(filled * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Why it is not working, and what resuming does. */
function Note({ video }: { readonly video: Video }) {
  if (video.state === 'failed' && video.error !== null)
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 px-4 py-3 text-sm"
      >
        <p className="font-medium text-destructive">
          Failed at {video.error.step}
        </p>
        <p className="mt-1">{video.error.message}</p>
        <p className="mt-1 text-muted-foreground">
          Resume starts again at {video.error.step}.
        </p>
      </div>
    );
  if (video.state === 'stopped')
    return (
      <p className="text-sm text-muted-foreground">
        Stopped. Resume picks up at {video.step ?? 'the first step not done'};
        the finished steps stay.
      </p>
    );
  if (video.state === 'queued')
    return (
      <p className="text-sm text-muted-foreground">
        Queued: one video is worked on at a time
        {video.latest ? ` (${video.latest})` : ''}.
      </p>
    );
  return null;
}

function Log({ events }: { readonly events: ReadonlyArray<Event> }) {
  const lines = logLines(events);
  const box = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const follow = useCallback(
    (last: HTMLElement | null) => {
      const scroller = last?.parentElement;
      if (scroller && following) scroller.scrollTop = scroller.scrollHeight;
    },
    [following],
  );
  return (
    <div className="relative">
      <div
        ref={box}
        role="log"
        aria-label="Log"
        tabIndex={0}
        onScroll={({ currentTarget: scroller }) =>
          setFollowing(
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
              24,
          )
        }
        className="h-[max(16rem,calc(100dvh-var(--stack-bar)-var(--steps-h,3.5rem)-5rem-env(safe-area-inset-bottom)))] overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/30 px-3 py-3 font-mono text-xs leading-5 tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4 sm:text-[13px] sm:leading-6"
      >
        {lines.length === 0 && (
          <p className="text-muted-foreground">Nothing logged yet.</p>
        )}
        {lines.map((line, index) => (
          <div
            key={line.key}
            ref={index === lines.length - 1 ? follow : undefined}
            className="pl-[4ch] -indent-[4ch] break-words whitespace-pre-wrap sm:pl-[24ch] sm:-indent-[24ch]"
          >
            {textOf(line)}
          </div>
        ))}
      </div>
      {!following && (
        <button
          type="button"
          onClick={() => {
            const scroller = box.current;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
            setFollowing(true);
          }}
          className="absolute bottom-3 left-1/2 flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium shadow-md transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
        >
          <ArrowDownIcon className="size-4" /> Latest
        </button>
      )}
    </div>
  );
}

/** The height of what `ref` is set on, kept as it changes. */
const useHeight = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
};

export function Working({
  video,
  events,
}: {
  readonly video: Video;
  readonly events: ReadonlyArray<Event>;
}) {
  const [steps, height] = useHeight();
  return (
    <div
      className="space-y-4"
      style={
        height === null
          ? undefined
          : ({ '--steps-h': `${height}px` } as CSSProperties)
      }
    >
      <div
        ref={steps}
        className="sticky top-(--stack-bar) z-20 -mx-4 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6"
      >
        <Compact video={video} />
        <Steps video={video} />
      </div>
      <Note video={video} />
      <Log events={events} />
    </div>
  );
}
