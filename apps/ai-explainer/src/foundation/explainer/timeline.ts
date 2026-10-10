import { fps } from '../canvas/index.ts';

export type Voiceover = {
  lines: readonly { id: string; seconds: number; src: string; text: string }[];
};

// The frame at which the narrator reaches `word` in line `id`, estimated from
// its position in the line, plus an optional delay in seconds.
export type Cue = (id: string, word?: string, delay?: number) => number;

// Each line lasts as long as its narration, so timing always follows the
// voice. `pauses` holds seconds of silence before a line; `tail` the silence
// after the last one.
export function timelineOf(
  voiceover: Voiceover,
  {
    pauses = {},
    tail = 0,
  }: { pauses?: Record<string, number>; tail?: number } = {},
) {
  let from = 0;
  const timeline = voiceover.lines.map((line) => {
    from += Math.round((pauses[line.id] ?? 0) * fps);
    const durationInFrames = Math.ceil(line.seconds * fps);
    const entry = { ...line, from, durationInFrames };
    from += durationInFrames;
    return entry;
  });
  const cue: Cue = (id, word, delay = 0) => {
    const line = timeline.find((entry) => entry.id === id);
    if (!line) throw new Error(`No line "${id}"`);
    const index = word ? line.text.indexOf(word) : 0;
    if (index < 0) throw new Error(`"${word}" is not in line "${id}"`);
    return (
      line.from +
      (index / line.text.length) * line.durationInFrames +
      delay * fps
    );
  };
  return {
    timeline,
    cue,
    durationInFrames: Math.max(from + Math.round(tail * fps), 1),
  };
}

export type Timeline = ReturnType<typeof timelineOf>['timeline'];
