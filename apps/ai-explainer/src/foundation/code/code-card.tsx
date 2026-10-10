import type { CSSProperties } from 'react';
import { CircleX } from '@kstackz/web-platform/components/lucide';
import { ease, mix } from '../canvas/index.ts';
import { useStyle } from '../style/index.ts';
import { tokens, type Lang } from './highlight.ts';

// One stop of a code card's highlight: from frame `at`, lines `lines`
// (1-based, inclusive) stand out and the rest recede; `null` shows all.
export type CodeStep = { at: number; lines: [number, number] | null };

// A type error drawn the way an editor shows it: `text` on `line` gets a red
// squiggle and `message` appears beneath the code, from frame `at`.
export type Problem = {
  at: number;
  line: number;
  text: string;
  message: string;
};

const lineHeight = 30;
const dimmed = 0.34;
// Text shrinks, down to a floor, until the longest line fits the card.
const fontSize = { most: 19, least: 15 };
const advance = 0.6;

function stepAt(steps: CodeStep[], frame: number) {
  const passed = steps.filter((step) => frame >= step.at);
  const current = passed.at(-1);
  const previous = passed.at(-2);
  return {
    from: previous?.lines ?? null,
    to: current?.lines ?? null,
    t: current ? ease(frame, current.at, 0.5) : 1,
  };
}

// A source file in a card, coloured by Shiki in the Style's code theme. Its
// highlight travels from step to step, and a file longer than `rows` lines
// scrolls to keep the highlight in view.
export function CodeCard({
  title,
  code,
  lang = 'typescript',
  frame,
  steps = [],
  rows = 30,
  width = 820,
  problem,
}: {
  title: string;
  code: string;
  lang?: Lang;
  frame: number;
  steps?: CodeStep[];
  rows?: number;
  width?: number;
  problem?: Problem;
}) {
  const style = useStyle();
  const lines = tokens(code, lang, style.code);
  const shown = Math.min(rows, lines.length);
  const longest = Math.max(
    ...lines.map((line) =>
      line.reduce((sum, token) => sum + token.content.length, 0),
    ),
  );
  const size = Math.max(
    fontSize.least,
    Math.min(fontSize.most, (width - 128) / (longest * advance)),
  );
  const { from, to, t } = stepAt(steps, frame);

  const dimOf = (range: [number, number] | null, line: number) =>
    range && (line < range[0] || line > range[1]) ? 1 : 0;
  const scrollOf = (range: [number, number] | null) =>
    range
      ? Math.max(
          0,
          Math.min(
            lines.length - shown,
            Math.round((range[0] + range[1]) / 2 - shown / 2),
          ),
        )
      : 0;
  const scroll = mix(scrollOf(from), scrollOf(to), t) * lineHeight;
  const band = to ?? from;
  const bandOpacity = from && to ? 1 : to ? t : from ? 1 - t : 0;
  const bandTop =
    from && to
      ? mix(from[0] - 1, to[0] - 1, t) * lineHeight
      : ((band?.[0] ?? 1) - 1) * lineHeight;
  const bandHeight =
    from && to
      ? mix(from[1] - from[0] + 1, to[1] - to[0] + 1, t) * lineHeight
      : band
        ? (band[1] - band[0] + 1) * lineHeight
        : 0;
  const showProblem = problem ? ease(frame, problem.at, 0.5) : 0;
  const fadeTop = scroll > 0;
  const fadeBottom = scroll < (lines.length - shown) * lineHeight;

  return (
    <div
      className="overflow-hidden border"
      style={{
        width,
        background: 'var(--surface)',
        borderColor: 'var(--surface-line)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--surface-shadow)',
      }}
    >
      <div
        className="border-b px-6 py-3.5 text-[17px] tracking-wide"
        style={{
          borderColor:
            'color-mix(in oklab, var(--surface-line) 70%, transparent)',
          fontFamily: style.font.mono,
        }}
      >
        <span style={{ color: 'var(--surface-muted)' }}>{title}</span>
      </div>
      <div
        className="relative overflow-hidden py-4"
        style={{
          height: shown * lineHeight + 32,
          maskImage: `linear-gradient(to bottom, ${fadeTop ? 'transparent' : 'black'} 0, black 56px, black calc(100% - 56px), ${fadeBottom ? 'transparent' : 'black'} 100%)`,
        }}
      >
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          <div
            className="absolute right-3 left-3"
            style={{
              top: bandTop,
              height: bandHeight,
              opacity: bandOpacity,
              background: 'var(--focus)',
              borderLeft: '3px solid var(--focus-edge)',
              borderRadius: 4,
            }}
          />
          {lines.map((line, i) => {
            const number = i + 1;
            const opacity =
              1 - (1 - dimmed) * mix(dimOf(from, number), dimOf(to, number), t);
            const squiggle =
              problem && problem.line === number ? problem.text : null;
            return (
              <div
                key={i}
                className="relative flex px-6 whitespace-pre"
                style={{
                  height: lineHeight,
                  lineHeight: `${lineHeight}px`,
                  fontFamily: style.font.mono,
                  fontSize: size,
                  opacity,
                }}
              >
                <span
                  className="mr-6 w-7 shrink-0 text-right tabular-nums select-none"
                  style={{ color: 'var(--surface-muted)', opacity: 0.6 }}
                >
                  {number}
                </span>
                <span>
                  {squiggled(line, squiggle, showProblem).map((part, k) => (
                    <span key={k} style={part.style}>
                      {part.content}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {problem && (
        <div
          className="flex gap-3 border-t px-6 py-4 text-[17px] leading-[1.45]"
          style={{
            opacity: showProblem,
            borderColor:
              'color-mix(in oklab, var(--surface-line) 70%, transparent)',
            fontFamily: style.font.mono,
            color:
              style.name === 'paper'
                ? 'oklch(0.5 0.19 27)'
                : 'oklch(0.78 0.14 25)',
          }}
        >
          <CircleX className="mt-1 size-5 shrink-0" />
          <span className="whitespace-pre-wrap">{problem.message}</span>
        </div>
      )}
    </div>
  );
}

type Part = { content: string; style: CSSProperties };

// A line's tokens, split so that the first occurrence of `text` can carry a
// wavy red underline, drawn in as `progress` goes from 0 to 1.
function squiggled(
  line: ReturnType<typeof tokens>[number],
  text: string | null,
  progress: number,
): Part[] {
  const colored = line.map((token) => ({
    content: token.content,
    style: {
      color: token.color,
      fontStyle: (token.fontStyle ?? 0) & 1 ? 'italic' : undefined,
    } as CSSProperties,
  }));
  const start = text
    ? line
        .map((token) => token.content)
        .join('')
        .indexOf(text)
    : -1;
  if (!text || start < 0 || progress === 0) return colored;
  const end = start + text.length;
  const parts: Part[] = [];
  let column = 0;
  for (const part of colored) {
    const from = column;
    const to = column + part.content.length;
    column = to;
    const cuts = [
      from,
      Math.max(from, Math.min(start, to)),
      Math.max(from, Math.min(end, to)),
      to,
    ];
    for (let k = 0; k < 3; k++) {
      const content = part.content.slice(cuts[k]! - from, cuts[k + 1]! - from);
      if (!content) continue;
      parts.push({
        content,
        style:
          k === 1
            ? {
                ...part.style,
                textDecorationLine: 'underline',
                textDecorationStyle: 'wavy',
                textDecorationColor: `oklch(0.64 0.22 27 / ${progress})`,
                textDecorationThickness: 2,
                textUnderlineOffset: 6,
              }
            : part.style,
      });
    }
  }
  return parts;
}
