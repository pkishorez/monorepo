// When each beat of a Walkthrough starts, when its line is spoken, and when
// it ends, in seconds. The recorder and the video both read it, so the
// picture and the voice keep time.

/** One beat of a Walkthrough's script. */
export type Beat = { readonly id: string; readonly chapter: number };

/** How a beat is held and played while it is recorded. */
export type Take<Stage> = {
  /** Seconds before the line is spoken. A chapter's first beat waits longer, for its title. */
  readonly lead?: number;
  /** Seconds of quiet after the line. */
  readonly rest?: number;
  /** The least the whole beat lasts, for a beat whose action outlasts its line. */
  readonly hold?: number;
  /** What happens on screen, with times in seconds from the beat's start. */
  readonly play?: (stage: Stage) => Promise<void>;
};

export type Timed = {
  readonly id: string;
  readonly start: number;
  /** When the line starts; `null` for a beat with no line. */
  readonly speak: number | null;
  readonly end: number;
};

const LEAD = { chapter: 2.8, beat: 0.6 };
const REST = 1.2;

export function timingOf<Stage>(
  beats: ReadonlyArray<Beat>,
  lines: ReadonlyArray<{ readonly id: string; readonly seconds: number }>,
  takes: Readonly<Record<string, Take<Stage>>>,
): { beats: Timed[]; seconds: number } {
  let at = 0;
  const timed = beats.map((beat, i) => {
    const take = takes[beat.id] ?? {};
    const line = lines.find((each) => each.id === beat.id);
    const opens = i > 0 && beats[i - 1]!.chapter !== beat.chapter;
    const lead = take.lead ?? (opens ? LEAD.chapter : LEAD.beat);
    const spoken = line ? lead + line.seconds + (take.rest ?? REST) : 0;
    const length = Math.max(spoken, take.hold ?? 0);
    const entry = {
      id: beat.id,
      start: at,
      speak: line ? at + lead : null,
      end: at + length,
    };
    at += length;
    return entry;
  });
  return { beats: timed, seconds: at };
}
