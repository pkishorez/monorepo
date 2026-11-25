import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@kestack/web-platform/ui/components/toggle-group';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { ArrowUpIcon, PlayIcon, SquareIcon } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type {
  CutKind,
  Cuts as CutsData,
  Range,
} from '../../../../../video/library/schema.ts';
import { clipOf, type Filter, type Pages } from '../../../../shared/index.ts';
import { clock, span } from '../../../format/index.ts';
import type { ViewProps } from '@kestack/kabuki/react/types';

type Self = ViewProps<typeof Pages.VideoLive>;
type Send = Self['send'];

const KINDS: ReadonlyArray<{ readonly kind: CutKind; readonly label: string }> =
  [
    { kind: 'ad', label: 'Ads' },
    { kind: 'ask', label: 'Asks' },
    { kind: 'filler-talk', label: 'Filler talk' },
    { kind: 'fillers', label: 'Fillers' },
    { kind: 'silence', label: 'Silence' },
  ];

const LABEL: Readonly<Record<CutKind, string>> = {
  ad: 'Ad',
  ask: 'Ask',
  'filler-talk': 'Filler talk',
  fillers: 'Fillers',
  silence: 'Silence',
};

type Removed = CutsData['removed'][number];
type Clip = Self['model']['clip'];

const inside = (spans: ReadonlyArray<Range>, time: number) =>
  spans.some(({ start, end }) => time >= start && time < end);

/**
 * A cut's clip: from 2 s before it to 1.5 s after, a long one by its first
 * 20 s and last 5 s. It starts on the tap that asked for it where the
 * browser allows; otherwise its own play button starts it. Under it, a
 * thin bar marks the removed seconds and where playback is, and while
 * playback is inside them, "Removed" shows over the picture. Its time is
 * read every frame, as a pause is often shorter than the browser's
 * timeupdate.
 */
function ClipPlayer({
  src,
  cut,
  removed,
}: {
  readonly src: string;
  readonly cut: Removed;
  readonly removed: ReadonlyArray<Range>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    let frame = 0;
    const read = () => {
      const time = element.currentTime;
      const total = element.duration;
      if (head.current !== null && Number.isFinite(total) && total > 0)
        head.current.style.left = `${Math.min(100, (time / total) * 100)}%`;
      setGone(inside(removed, time));
    };
    const loop = () => {
      read();
      frame = element.paused ? 0 : requestAnimationFrame(loop);
    };
    const playing = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const events = ['timeupdate', 'seeked', 'pause', 'ended'] as const;
    for (const name of events) element.addEventListener(name, read);
    element.addEventListener('play', playing);
    element.play().catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      for (const name of events) element.removeEventListener(name, read);
      element.removeEventListener('play', playing);
    };
  }, [removed]);
  const length = cut.end - cut.start;
  const shortened = removed.length > 1;
  const at = (seconds: number) =>
    duration === null ? 0 : `${(seconds / duration) * 100}%`;
  return (
    <div className="mt-2 space-y-1" data-zone-gesture="disabled">
      <div className="relative">
        <video
          ref={video}
          src={src}
          onLoadedMetadata={({ currentTarget }) =>
            setDuration(currentTarget.duration)
          }
          controls
          playsInline
          preload="auto"
          aria-label={`${LABEL[cut.kind]} at ${clock(cut.start)} of the original, with 2 seconds before it`}
          className="block aspect-video w-full rounded-md bg-black"
        />
        {gone && (
          <span
            data-removed
            className="pointer-events-none absolute top-2 left-2 rounded-md bg-destructive px-2 py-1 text-sm font-semibold text-white shadow"
          >
            Removed
          </span>
        )}
      </div>
      <div
        aria-hidden
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
      >
        {duration !== null &&
          removed.map((part, index) => (
            <div
              key={index}
              className={`absolute inset-y-0 bg-destructive ${index > 0 ? 'border-l-2 border-background' : ''}`}
              style={{ left: at(part.start), width: at(part.end - part.start) }}
            />
          ))}
        <div
          ref={head}
          className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-foreground"
        />
      </div>
      <p className="text-xs text-pretty text-muted-foreground">
        <span className="mr-1 inline-block size-2 rounded-full bg-destructive align-middle" />
        {shortened
          ? `Removed: this ${span(length)} cut, shown by its first 20 s and last 5 s.`
          : `Removed: ${span(length)}. The clip starts 2 s before it.`}
      </p>
    </div>
  );
}

/** The cut playing: "Preparing clip…" while its clip is made, then the clip. */
function Playing({
  id,
  index,
  cut,
  clip,
}: {
  readonly id: string;
  readonly index: number;
  readonly cut: Removed;
  readonly clip: Clip;
}) {
  if (clip === null || clip.cut !== index)
    return (
      <p
        role="status"
        className="mt-2 flex aspect-video w-full items-center justify-center gap-2 rounded-md bg-muted text-sm text-muted-foreground"
      >
        <Spinner /> Preparing clip…
      </p>
    );
  if (clip.removed === null)
    return (
      <p role="alert" className="mt-2 text-sm text-destructive">
        {clip.error}
      </p>
    );
  return (
    <ClipPlayer
      key={index}
      src={clipOf(id, index)}
      cut={cut}
      removed={clip.removed}
    />
  );
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The first of `items` not yet scrolled up past `top`, in viewport px, by its place from 0; `items` run down the page. */
const firstBelow = (items: HTMLCollection, top: number) => {
  let low = 0;
  let high = items.length - 1;
  let found = items.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (items[middle]!.getBoundingClientRect().bottom > top + 1) {
      found = middle;
      high = middle - 1;
    } else low = middle + 1;
  }
  return found;
};

/**
 * Where the reading is in the list on a phone: the first cut below the
 * kinds' bar, from 1, and whether the list has scrolled up under it.
 * Read on scroll, once a frame, while the tab is open.
 */
const usePlace = (
  bar: RefObject<HTMLDivElement | null>,
  list: RefObject<HTMLOListElement | null>,
  active: boolean,
  count: number,
) => {
  const [place, setPlace] = useState({ at: 1, away: false });
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const items = list.current?.children;
      const edge = bar.current?.getBoundingClientRect().bottom;
      if (items === undefined || edge === undefined || items.length === 0)
        return setPlace({ at: 1, away: false });
      const at = firstBelow(items, edge) + 1;
      const away = items[0]!.getBoundingClientRect().top < edge - 1;
      setPlace((was) =>
        was.at === at && was.away === away ? was : { at, away },
      );
    };
    const changed = () => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };
    read();
    addEventListener('scroll', changed, { passive: true });
    addEventListener('resize', changed);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', changed);
      removeEventListener('resize', changed);
    };
  }, [bar, list, active, count]);
  return place;
};

/** Every part removed, by kind if picked, each with its reason, where it was in the original, and a way to see and hear it. */
export function Cuts({
  id,
  cuts,
  filter,
  playing,
  clip,
  send,
  onPlay,
  active,
}: {
  readonly id: string;
  readonly cuts: CutsData;
  readonly filter: Filter;
  readonly playing: number | null;
  readonly clip: Clip;
  readonly send: Send;
  /** Before a cut plays: the short video pauses. */
  readonly onPlay: () => void;
  /** Whether its tab is the one open. */
  readonly active: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const count = (kind: CutKind) =>
    cuts.removed.filter((cut) => cut.kind === kind).length;
  const shown = cuts.removed
    .map((cut, index) => ({ cut, index }))
    .filter(({ cut }) => filter === 'all' || cut.kind === filter);
  const place = usePlace(bar, list, active, shown.length);
  // Back to the first cut, just under the kinds' bar, on a phone.
  const toTop = (behavior: ScrollBehavior) => {
    const element = root.current;
    const pinned = document.querySelector('[data-pinned]');
    if (element === null || pinned === null) return;
    const top =
      scrollY +
      element.getBoundingClientRect().top -
      pinned.getBoundingClientRect().bottom;
    if (top < scrollY) scrollTo({ top, behavior });
  };
  return (
    <div
      ref={root}
      className="flex flex-col gap-1 lg:h-full lg:min-h-0 lg:gap-3"
    >
      <div
        ref={bar}
        data-zone-gesture="disabled"
        className="sticky top-(--stack-panel) z-10 -mx-4 flex h-(--filters-h) items-center gap-1 border-b border-border bg-background pl-4 sm:mx-0 sm:pl-0 lg:static lg:h-auto lg:border-0"
      >
        <ToggleGroup
          aria-label="Kind of cut"
          variant="outline"
          size="sm"
          spacing={1}
          className="no-scrollbar min-w-0 flex-1 flex-nowrap overflow-x-auto py-1 lg:flex-wrap lg:overflow-visible lg:py-0"
          value={[filter]}
          onValueChange={([picked]) => {
            const filter =
              picked === 'all'
                ? 'all'
                : KINDS.find(({ kind }) => kind === picked)?.kind;
            if (!filter) return;
            toTop('instant');
            send({ _tag: 'Pick', filter });
          }}
        >
          <ToggleGroupItem
            value="all"
            className="h-9 shrink-0 px-3 lg:pointer-fine:h-8 lg:pointer-fine:px-2.5"
          >
            All{' '}
            <span className="text-muted-foreground tabular-nums">
              {cuts.removed.length}
            </span>
          </ToggleGroupItem>
          {KINDS.filter(({ kind }) => count(kind) > 0).map(
            ({ kind, label }) => (
              <ToggleGroupItem
                key={kind}
                value={kind}
                className="h-9 shrink-0 px-3 lg:pointer-fine:h-8 lg:pointer-fine:px-2.5"
              >
                {label}{' '}
                <span className="text-muted-foreground tabular-nums">
                  {count(kind)}
                </span>
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>
        {shown.length > 0 && (
          <span className="flex shrink-0 items-center pr-1 lg:hidden">
            <span
              data-place
              className="px-1 text-xs text-muted-foreground tabular-nums"
            >
              {place.at} of {shown.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to the first cut"
              tabIndex={place.away ? 0 : -1}
              aria-hidden={!place.away}
              onClick={() => toTop(reduced() ? 'instant' : 'smooth')}
              className={`size-11 text-muted-foreground transition-opacity duration-150 ease-out motion-reduce:transition-none ${place.away ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              <ArrowUpIcon />
            </Button>
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          Nothing was removed.
        </p>
      ) : (
        <ol
          ref={list}
          className="divide-y divide-border lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          {shown.map(({ cut, index }) => (
            <li
              key={index}
              aria-current={index === playing || undefined}
              className="py-3"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{LABEL[cut.kind]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {clock(cut.start)}–{clock(cut.end)} ·{' '}
                      {span(cut.end - cut.start)}
                    </span>
                  </p>
                  {cut.reason !== undefined && (
                    <p className="text-sm text-pretty">{cut.reason}</p>
                  )}
                  {cut.text !== undefined && (
                    <p className="line-clamp-3 text-sm text-pretty text-muted-foreground">
                      “{cut.text}”
                    </p>
                  )}
                </div>
                {index === playing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-11 px-3 lg:pointer-fine:h-8"
                    aria-label={`Close the ${LABEL[cut.kind].toLowerCase()} at ${clock(cut.start)}`}
                    onClick={() => send({ _tag: 'Play', cut: null })}
                  >
                    <SquareIcon /> Close
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 px-3 lg:pointer-fine:h-8"
                    aria-label={`Play the ${LABEL[cut.kind].toLowerCase()} at ${clock(cut.start)} of the original`}
                    onClick={() => {
                      onPlay();
                      send({ _tag: 'Play', cut: index });
                    }}
                  >
                    <PlayIcon /> Play
                  </Button>
                )}
              </div>
              {index === playing && (
                <Playing id={id} index={index} cut={cut} clip={clip} />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
