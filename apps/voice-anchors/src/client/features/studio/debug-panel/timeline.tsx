import { cn } from 'kui-toolkit/utils';
import type { PassReport } from '../../../../engine/session/index.ts';
import type {
  Segment,
  TimedWord,
} from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';

const pxPerSecond = 80;
const rowHeight = 26;
const gutter = 96;

interface Press {
  readonly id: string;
  readonly at: number;
  readonly label: string;
}

const x = (seconds: number) => gutter + seconds * pxPerSecond;

function Ruler({ seconds }: { readonly seconds: number }) {
  const ticks = Array.from({ length: Math.ceil(seconds) + 1 }, (_, i) => i);
  return (
    <g className="text-[10px] fill-muted-foreground">
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={x(tick)}
            x2={x(tick)}
            y1={0}
            y2={18}
            className="stroke-border"
          />
          <text x={x(tick) + 3} y={12}>
            {tick}s
          </text>
        </g>
      ))}
    </g>
  );
}

function RowLabel({ y, text }: { readonly y: number; readonly text: string }) {
  return (
    <text
      x={4}
      y={y + rowHeight / 2 + 4}
      className="text-[11px] font-medium fill-foreground"
    >
      {text}
    </text>
  );
}

function WordBar({
  word,
  y,
  tone,
}: {
  readonly word: TimedWord | { text: string; start: number; end: number };
  readonly y: number;
  readonly tone: 'final' | 'provisional' | 'raw';
}) {
  const width = Math.max(2, (word.end - word.start) * pxPerSecond);
  return (
    <g>
      <title>
        {`"${word.text}" ${word.start.toFixed(2)}s to ${word.end.toFixed(2)}s`}
      </title>
      <rect
        x={x(word.start)}
        y={y + 4}
        width={width}
        height={rowHeight - 8}
        rx={3}
        className={cn(
          tone === 'final' && 'fill-foreground/80',
          tone === 'provisional' &&
            'fill-muted-foreground/30 stroke-muted-foreground [stroke-dasharray:3_2]',
          tone === 'raw' && 'fill-sky-500/40 stroke-sky-600',
        )}
      />
      <line
        x1={x(word.start)}
        x2={x(word.start)}
        y1={y + 2}
        y2={y + rowHeight - 2}
        className="stroke-foreground"
      />
      <text
        x={x(word.start) + 3}
        y={y + rowHeight / 2 + 4}
        className={cn(
          'text-[10px]',
          tone === 'final' ? 'fill-background' : 'fill-foreground',
        )}
        clipPath={`inset(0 0 0 0)`}
      >
        {word.text}
      </text>
    </g>
  );
}

/**
 * Every timestamp of a run on one axis: passes and their windows, the raw
 * words of the selected pass, the settled words, and the presses.
 */
export function Timeline({
  segments,
  passes,
  selectedPass,
  onSelectPass,
}: {
  readonly segments: ReadonlyArray<Segment<ContextPayload>>;
  readonly passes: ReadonlyArray<PassReport>;
  readonly selectedPass: number | null;
  readonly onSelectPass: (index: number | null) => void;
}) {
  const words = segments.flatMap((segment) =>
    segment.kind === 'transcription' ? segment.words : [],
  );
  const presses: Array<Press> = segments.flatMap((segment) =>
    segment.kind === 'injected'
      ? [{ id: segment.id, at: segment.at, label: segment.payload.label }]
      : [],
  );
  const end = Math.max(
    1,
    ...passes.map((pass) => pass.to),
    ...words.map((word) => word.end),
    ...presses.map((press) => press.at),
  );
  const selected = passes.find((pass) => pass.index === selectedPass) ?? null;
  const rows = {
    passes: 24,
    raw: 24 + rowHeight,
    words: 24 + rowHeight * 2,
    presses: 24 + rowHeight * 3,
  };
  const height = rows.presses + rowHeight + 8;
  const width = x(end) + 40;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block select-none">
        <Ruler seconds={end} />
        <RowLabel y={rows.passes} text="passes" />
        <RowLabel
          y={rows.raw}
          text={selected ? `raw pass #${selected.index}` : 'raw (pick a pass)'}
        />
        <RowLabel y={rows.words} text="transcript" />
        <RowLabel y={rows.presses} text="presses" />

        {passes.map((pass) => (
          <g
            key={pass.index}
            className="cursor-pointer"
            onClick={() =>
              onSelectPass(selectedPass === pass.index ? null : pass.index)
            }
          >
            <title>
              {`pass #${pass.index}: ${pass.from.toFixed(2)}s to ${pass.to.toFixed(2)}s, ${pass.outcome}, ${pass.durationMs} ms, ${pass.words.length} words, frozen until ${pass.frozenUntil.toFixed(2)}s`}
            </title>
            <rect
              x={x(pass.from)}
              y={rows.passes + 6 + (pass.index % 3) * 4}
              width={Math.max(2, (pass.to - pass.from) * pxPerSecond)}
              height={6}
              rx={2}
              className={cn(
                pass.outcome === 'transcribed' || pass.outcome === 'last'
                  ? 'fill-emerald-500/60'
                  : pass.outcome === 'silent'
                    ? 'fill-amber-500/50'
                    : 'fill-muted-foreground/30',
                selectedPass === pass.index && 'stroke-foreground stroke-2',
              )}
            />
            <line
              x1={x(pass.frozenUntil)}
              x2={x(pass.frozenUntil)}
              y1={rows.passes + 2}
              y2={rows.passes + rowHeight - 2}
              className="stroke-emerald-700"
            />
          </g>
        ))}

        {selected?.words.map((word, index) => (
          <WordBar key={index} word={word} y={rows.raw} tone="raw" />
        ))}

        {words.map((word, index) => (
          <WordBar
            key={`${word.start}-${index}`}
            word={word}
            y={rows.words}
            tone={word.final ? 'final' : 'provisional'}
          />
        ))}

        {presses.map((press) => (
          <g key={press.id}>
            <title>{`${press.label} pressed at ${press.at.toFixed(2)}s`}</title>
            <line
              x1={x(press.at)}
              x2={x(press.at)}
              y1={20}
              y2={rows.presses + rowHeight}
              className="stroke-primary"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
            <text
              x={x(press.at) + 4}
              y={rows.presses + rowHeight / 2 + 4}
              className="text-[10px] font-medium fill-primary"
            >
              {press.label} {press.at.toFixed(2)}s
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
