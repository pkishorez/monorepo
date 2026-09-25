import type { CSSProperties, ReactNode } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'kui-toolkit/components/ui/popover';
import { cn } from 'kui-toolkit/utils';
import type {
  Segment,
  TimedWord,
} from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';

const pxPerSecond = 80;
const inset = 8;

const x = (seconds: number) => inset + seconds * pxPerSecond;
const sec = (seconds: number) => `${seconds.toFixed(2)} s`;

interface Press {
  readonly id: string;
  readonly at: number;
  readonly label: string;
  readonly after: string | null;
  readonly final: boolean;
}

/** The presses in transcript order, each with the word it landed after. */
const pressesOf = (
  segments: ReadonlyArray<Segment<ContextPayload>>,
): ReadonlyArray<Press> => {
  let last: string | null = null;
  const presses: Array<Press> = [];
  for (const segment of segments) {
    if (segment.kind === 'transcription') {
      last = segment.words.at(-1)?.text ?? last;
    } else {
      presses.push({
        id: segment.id,
        at: segment.at,
        label: segment.payload.label,
        after: last,
        final: segment.final,
      });
    }
  }
  return presses;
};

function Detail({
  title,
  rows,
}: {
  readonly title: ReactNode;
  readonly rows: ReadonlyArray<readonly [string, ReactNode]>;
}) {
  return (
    <>
      <p className="font-medium">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {rows.map(([term, value]) => (
          <DetailRow key={term} term={term} value={value} />
        ))}
      </dl>
    </>
  );
}

function DetailRow({
  term,
  value,
}: {
  readonly term: string;
  readonly value: ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </>
  );
}

function WordBlock({ word }: { readonly word: TimedWord }) {
  const style: CSSProperties = {
    left: x(word.start),
    width: Math.max(4, (word.end - word.start) * pxPerSecond - 1),
  };
  return (
    <Popover>
      <PopoverTrigger
        style={style}
        className={cn(
          'absolute top-0 h-6 overflow-hidden rounded-sm border px-1 text-left text-[10px] leading-[22px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
          word.final
            ? 'border-transparent bg-foreground/80 text-background hover:bg-foreground'
            : 'border-dashed border-muted-foreground/60 bg-muted text-foreground hover:bg-muted-foreground/20',
        )}
      >
        {word.text}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-56 gap-2 p-3">
        <Detail
          title={`“${word.text}”`}
          rows={[
            ['starts', sec(word.start)],
            ['ends', sec(word.end)],
            ['lasts', `${Math.round((word.end - word.start) * 1000)} ms`],
            ['state', word.final ? 'final' : 'provisional'],
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}

function PressMarker({ press }: { readonly press: Press }) {
  return (
    <div className="absolute inset-y-0" style={{ left: x(press.at) }}>
      <span
        aria-hidden
        className="absolute top-6 bottom-0 left-0 border-l-2 border-dashed border-primary"
      />
      <Popover>
        <PopoverTrigger className="absolute top-0 left-0 h-5 -translate-x-1/2 rounded-full bg-primary px-2 text-[10px] font-medium whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {press.label}
        </PopoverTrigger>
        <PopoverContent side="top" className="w-60 gap-2 p-3">
          <Detail
            title={press.label}
            rows={[
              ['pressed', sec(press.at)],
              ['landed after', press.after ? `“${press.after}”` : 'the start'],
              ['state', press.final ? 'settled' : 'may still move'],
            ]}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** The run on the audio clock: presses above, the words they sit among below. */
export function Timeline({
  segments,
}: {
  readonly segments: ReadonlyArray<Segment<ContextPayload>>;
}) {
  const words = segments.flatMap((segment) =>
    segment.kind === 'transcription' ? segment.words : [],
  );
  const presses = pressesOf(segments);
  const end = Math.max(
    4,
    ...words.map((word) => word.end),
    ...presses.map((press) => press.at),
  );
  const ticks = Array.from({ length: Math.floor(end) + 1 }, (_, i) => i);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative" style={{ width: x(end) + 48, height: 76 }}>
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute top-0 h-full border-l border-border/60 pl-1 text-[10px] tabular-nums text-muted-foreground"
            style={{ left: x(tick) }}
          >
            {tick}s
          </span>
        ))}
        <div className="absolute inset-x-0 top-5 h-12">
          {presses.map((press) => (
            <PressMarker key={press.id} press={press} />
          ))}
          <div className="absolute inset-x-0 top-7">
            {words.map((word, index) => (
              <WordBlock key={index} word={word} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
