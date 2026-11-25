import type { Strength } from '../../library/index.ts';
import { stamp } from './format.ts';

/** What Claude is told about the video. */
export interface About {
  readonly title: string;
  readonly channel: string;
  readonly description: string;
  readonly chapters: ReadonlyArray<{
    readonly title: string;
    readonly start: number;
  }>;
}

/** A sentence as Claude reads it: its number and start time. */
export interface Numbered {
  readonly n: number;
  readonly start: number;
  readonly text: string;
}

/** The skill files, read fresh each run. */
export interface Skill {
  readonly rules: string;
  readonly learnings: string;
}

const LEARNINGS = `"learnings" is almost always []. Add a line only when this transcript taught you something that is all of: new (not already in the learnings above), general (true of many videos, not about this one), and would change how a future video is cut or summarised. Write it as a plain rule of one sentence.`;

const learned = (learnings: string) =>
  learnings.trim() === '' ? 'None yet.' : learnings.trim();

const video = (about: About) =>
  [
    `Title: ${about.title}`,
    `Channel: ${about.channel}`,
    about.chapters.length === 0
      ? 'Chapters: none'
      : `Chapters:\n${about.chapters.map((c) => `${stamp(c.start)} ${c.title}`).join('\n')}`,
    `Description:\n<description>\n${about.description.trim() || '(empty)'}\n</description>`,
  ].join('\n');

const numbered = (sentences: ReadonlyArray<Numbered>) =>
  sentences.map((s) => `[${s.n}] ${stamp(s.start)} ${s.text}`).join('\n');

/**
 * The prompt that asks Claude which sentences to cut. `part` is set when a
 * long transcript goes in chunks.
 */
export const cutPrompt = (input: {
  readonly skill: Skill;
  readonly strength: Strength;
  readonly about: About;
  readonly sentences: ReadonlyArray<Numbered>;
  readonly part: { readonly index: number; readonly count: number } | null;
}): string => {
  const kinds =
    input.strength === 'light'
      ? '"ad" or "ask"; at strength light nothing else is cut'
      : '"ad", "ask" or "filler-talk" (anything else the rules remove at this strength)';
  return `You are cutting a YouTube video's transcript down to a short video. The code has already removed silences and fillers; you decide which whole sentences go. Follow the cut rules below at strength "${input.strength}".

<cut-rules>
${input.skill.rules.trim()}
</cut-rules>

<learnings>
Learned on earlier videos; follow them too.
${learned(input.skill.learnings)}
</learnings>

Ads matter most to the viewer: missing one is the worst mistake. Sponsor reads are often woven in smoothly, with no pause or change of tone: the speaker slides from the subject into the product ("…and speaking of staying safe online, that's why I use…") and back out again. The description very often names the sponsors, with their links and discount codes: any stretch that talks up a product or company the description promotes is an ad, unless that product is the subject of the video. Cut the whole read, with the sentences that lead into it and out of it.

<video>
${video(input.about)}
</video>

${
  input.part === null
    ? 'The transcript'
    : `Part ${input.part.index} of ${input.part.count} of the transcript (parts overlap by a few sentences; judge only what you see)`
}, one numbered sentence per line with its start time:

<transcript>
${numbered(input.sentences)}
</transcript>

Reply with JSON only: no prose, no code fence. Exactly this shape:
{"cuts":[{"from":12,"to":18,"kind":"ad","reason":"sponsor read for a VPN"}],"learnings":[]}

- "from" and "to" are the first and last sentence numbers of one stretch to cut, inclusive, with from <= to. Use only numbers shown above.
- "kind" is ${kinds}.
- "reason" is a few plain words saying what the stretch is, like "sponsor read for a VPN" or "small talk about the guest's travel".
- "cuts" is [] when nothing should go.
- ${LEARNINGS}`;
};

/** The prompt that asks Claude for the summary of the trimmed transcript. */
export const summaryPrompt = (input: {
  readonly skill: Skill;
  readonly about: About;
  readonly sentences: ReadonlyArray<Numbered>;
}): string => `You are writing the summary of a short video, made from a YouTube video with its silences, fillers, ads and filler talk removed. Follow the summary rules below.

<summary-rules>
${input.skill.rules.trim()}
</summary-rules>

<learnings>
Learned on earlier videos; follow them too.
${learned(input.skill.learnings)}
</learnings>

<video>
${video(input.about)}
</video>

The creator's chapters above are at times of the short video. The short video's transcript, one numbered sentence per line with its start time in the short video:

<transcript>
${numbered(input.sentences)}
</transcript>

Reply with JSON only: no prose, no code fence. Exactly this shape:
{"overview":"Two or three sentences.","points":[{"text":"One key point.","sentence":4}],"chapters":[{"title":"Short title","sentence":1}],"learnings":[]}

- "sentence" is the number of the sentence where the point is made or the chapter starts. Use only numbers shown above.
- The first chapter starts at sentence 1.
- ${LEARNINGS}`;

/** The prompt again, with why the last reply could not be used. */
export const retryPrompt = (prompt: string, error: string): string =>
  `${prompt}

Your last reply could not be used: ${error}
Reply again with JSON only, in exactly the shape above.`;
