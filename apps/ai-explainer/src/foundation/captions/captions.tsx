import { AbsoluteFill } from 'remotion';
import { ease, fps } from '../canvas/index.ts';
import type { Timeline } from '../explainer/index.ts';
import { useStyle } from '../style/index.ts';

// Short enough to stay within two lines at the caption size.
const longest = 78;

type Chunk = { text: string; from: number; to: number };

// Splits a line into captions at sentence ends, then at commas and colons,
// then between words, so no caption runs past `longest` characters.
function split(text: string): string[] {
  const sentences = text.match(/[^.?!]+[.?!]*\s*/g) ?? [text];
  return sentences.flatMap((sentence) => {
    if (sentence.length <= longest) return [sentence];
    const clauses = sentence.match(/[^,:]+[,:]?\s*/g) ?? [sentence];
    const chunks: string[] = [];
    for (const clause of clauses) {
      const last = chunks.at(-1);
      if (last !== undefined && last.length + clause.length <= longest) {
        chunks[chunks.length - 1] = last + clause;
      } else if (clause.length <= longest) {
        chunks.push(clause);
      } else {
        const words = clause.split(/(?<=\s)/);
        const half = Math.ceil(words.length / 2);
        chunks.push(words.slice(0, half).join(''), words.slice(half).join(''));
      }
    }
    return chunks;
  });
}

// Each caption shows from the moment the narrator is estimated to reach it,
// the same estimate `cue` uses, until the next one or the line's end.
function chunksOf(timeline: Timeline): Chunk[] {
  return timeline.flatMap(({ text, from, durationInFrames }) => {
    let offset = 0;
    return split(text).map((part, i, parts) => {
      const start = from + (offset / text.length) * durationInFrames;
      offset += part.length;
      const end =
        i === parts.length - 1
          ? from + durationInFrames
          : from + (offset / text.length) * durationInFrames;
      return { text: part.trim().replace(/'/g, '’'), from: start, to: end };
    });
  });
}

// Burned-in captions: centred at the bottom, at most two lines, on a quiet
// scrim. Consecutive captions swap without a fade so reading never stalls.
export function Captions({
  timeline,
  frame,
}: {
  timeline: Timeline;
  frame: number;
}) {
  const style = useStyle();
  const chunks = chunksOf(timeline);
  const index = chunks.findIndex(({ from, to }) => frame >= from && frame < to);
  const chunk = chunks[index];
  if (!chunk) return null;
  const joined = (a?: Chunk, b?: Chunk) => a && b && b.from - a.to < 2;
  const enter = joined(chunks[index - 1], chunk)
    ? 1
    : ease(frame, chunk.from, 0.2);
  const exit = joined(chunk, chunks[index + 1])
    ? 1
    : 1 - ease(frame, chunk.to - 0.2 * fps, 0.2);
  return (
    <AbsoluteFill className="items-center justify-end pb-14">
      <div
        className="max-w-[1180px] rounded-[10px] px-6 py-2.5 text-center text-[36px] leading-[1.3] font-medium text-balance"
        style={{
          background: 'var(--caption)',
          color: 'var(--caption-ink)',
          fontFamily: style.font.body,
          opacity: Math.min(enter, exit),
        }}
      >
        {chunk.text}
      </div>
    </AbsoluteFill>
  );
}
