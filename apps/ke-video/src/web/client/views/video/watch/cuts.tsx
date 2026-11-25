import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@kestack/web-platform/ui/components/toggle-group';
import { PlayIcon, SquareIcon } from 'lucide-react';
import type {
  CutKind,
  Cuts as CutsData,
} from '../../../../../video/library/schema.ts';
import { mediaOf, type Filter, type Pages } from '../../../../shared/index.ts';
import { clock, span } from '../../../format/index.ts';
import type { ViewProps } from '@kestack/kabuki/react/types';

type Send = ViewProps<typeof Pages.VideoLive>['send'];

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

/**
 * The part of the original a cut removed, played on its own, under its
 * row. It starts on the tap that asked for it; where the browser plays a
 * media fragment's end, or not, it stops at the cut's end.
 */
const start = (element: HTMLVideoElement | null) => {
  element?.play().catch(() => {});
};

function Playing({
  id,
  cut,
}: {
  readonly id: string;
  readonly cut: CutsData['removed'][number];
}) {
  return (
    <video
      key={`${cut.start}-${cut.end}`}
      ref={start}
      src={`${mediaOf(id, 'original')}#t=${cut.start},${cut.end}`}
      onLoadedMetadata={({ currentTarget }) => {
        if (currentTarget.currentTime < cut.start - 0.5)
          currentTarget.currentTime = cut.start;
      }}
      onTimeUpdate={({ currentTarget }) => {
        if (currentTarget.currentTime >= cut.end) currentTarget.pause();
      }}
      controls
      playsInline
      preload="metadata"
      aria-label={`${LABEL[cut.kind]} at ${clock(cut.start)} of the original`}
      className="mt-2 aspect-video w-full rounded-md bg-black"
    />
  );
}

/** Every part removed, by kind if picked, each with its reason, where it was in the original, and a way to hear it. */
export function Cuts({
  id,
  cuts,
  filter,
  playing,
  send,
  onPlay,
}: {
  readonly id: string;
  readonly cuts: CutsData;
  readonly filter: Filter;
  readonly playing: number | null;
  readonly send: Send;
  /** Before a cut plays: the short video pauses. */
  readonly onPlay: () => void;
}) {
  const count = (kind: CutKind) =>
    cuts.removed.filter((cut) => cut.kind === kind).length;
  const shown = cuts.removed
    .map((cut, index) => ({ cut, index }))
    .filter(({ cut }) => filter === 'all' || cut.kind === filter);
  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <ToggleGroup
        aria-label="Kind of cut"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap pt-2 lg:pt-0"
        value={[filter]}
        onValueChange={([picked]) => {
          const filter =
            picked === 'all'
              ? 'all'
              : KINDS.find(({ kind }) => kind === picked)?.kind;
          if (filter) send({ _tag: 'Pick', filter });
        }}
      >
        <ToggleGroupItem
          value="all"
          className="h-11 px-3 lg:pointer-fine:h-8 lg:pointer-fine:px-2.5"
        >
          All{' '}
          <span className="text-muted-foreground tabular-nums">
            {cuts.removed.length}
          </span>
        </ToggleGroupItem>
        {KINDS.filter(({ kind }) => count(kind) > 0).map(({ kind, label }) => (
          <ToggleGroupItem
            key={kind}
            value={kind}
            className="h-11 px-3 lg:pointer-fine:h-8 lg:pointer-fine:px-2.5"
          >
            {label}{' '}
            <span className="text-muted-foreground tabular-nums">
              {count(kind)}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing was removed.</p>
      ) : (
        <ol className="divide-y divide-border lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
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
                    <p className="text-sm text-pretty text-muted-foreground">
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
              {index === playing && <Playing id={id} cut={cut} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
