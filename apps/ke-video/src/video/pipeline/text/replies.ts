import { Effect, Result, Schema } from 'effect';
import { retryPrompt } from './prompts.ts';

const Learnings = Schema.Array(Schema.String);

const CutsReply = Schema.Struct({
  cuts: Schema.Array(
    Schema.Struct({
      from: Schema.Int,
      to: Schema.Int,
      kind: Schema.Literals(['ad', 'ask', 'filler-talk']),
      reason: Schema.String,
    }),
  ),
  learnings: Learnings,
});

const SummaryReply = Schema.Struct({
  overview: Schema.String,
  points: Schema.Array(
    Schema.Struct({ text: Schema.String, sentence: Schema.Int }),
  ),
  chapters: Schema.Array(
    Schema.Struct({ title: Schema.String, sentence: Schema.Int }),
  ),
  learnings: Learnings,
});

export type CutsReply = typeof CutsReply.Type;
export type SummaryReply = typeof SummaryReply.Type;
type ReplyCut = CutsReply['cuts'][number];

/** The JSON object in a reply: bare, inside a ```json fence, or amid other words. */
export const jsonIn = (reply: string): Result.Result<unknown, string> => {
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(reply)?.[1];
  const tries = [reply.trim(), fenced?.trim()];
  const first = reply.indexOf('{');
  const last = reply.lastIndexOf('}');
  if (first !== -1 && last > first) tries.push(reply.slice(first, last + 1));
  for (const text of tries) {
    if (text === undefined || text === '') continue;
    try {
      return Result.succeed(JSON.parse(text) as unknown);
    } catch {}
  }
  return Result.fail('it is not a JSON object');
};

const decode = <A>(
  reply: string,
  decodeJson: (json: unknown) => Result.Result<A, Schema.SchemaError>,
): Result.Result<A, string> =>
  Result.flatMap(jsonIn(reply), (json) =>
    Result.mapError(decodeJson(json), (error) => error.message),
  );

const PRIORITY = { ad: 0, ask: 1, 'filler-talk': 2 } as const;

/** Cuts in order, overlapping ones merged; an ad wins over an ask, an ask over filler talk. */
export const mergeCuts = (cuts: ReadonlyArray<ReplyCut>): Array<ReplyCut> => {
  const sorted = [...cuts].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Array<ReplyCut> = [];
  for (const cut of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || cut.from > last.to) {
      merged.push({ ...cut });
      continue;
    }
    merged[merged.length - 1] = {
      from: last.from,
      to: Math.max(last.to, cut.to),
      kind: PRIORITY[cut.kind] < PRIORITY[last.kind] ? cut.kind : last.kind,
      reason:
        last.reason === cut.reason
          ? last.reason
          : `${last.reason}; ${cut.reason}`,
    };
  }
  return merged;
};

const outside = (numbers: ReadonlyArray<number>, from: number, to: number) =>
  numbers.find((n) => n < from || n > to);

/** Claude's cuts, checked against sentences `first` to `last`, and merged. */
export const decodeCuts =
  (first: number, last: number) =>
  (reply: string): Result.Result<CutsReply, string> =>
    Result.flatMap(
      decode(reply, Schema.decodeUnknownResult(CutsReply)),
      (answer) => {
        const backwards = answer.cuts.find((cut) => cut.from > cut.to);
        if (backwards !== undefined)
          return Result.fail(
            `cut ${backwards.from}–${backwards.to} has "from" after "to"`,
          );
        const missing = outside(
          answer.cuts.flatMap((cut) => [cut.from, cut.to]),
          first,
          last,
        );
        if (missing !== undefined)
          return Result.fail(
            `sentence ${missing} does not exist; the sentences are ${first} to ${last}`,
          );
        return Result.succeed({ ...answer, cuts: mergeCuts(answer.cuts) });
      },
    );

/** Claude's summary, its sentence numbers checked against 1 to `count`. */
export const decodeSummary =
  (count: number) =>
  (reply: string): Result.Result<SummaryReply, string> =>
    Result.flatMap(
      decode(reply, Schema.decodeUnknownResult(SummaryReply)),
      (answer) => {
        const missing = outside(
          [...answer.points, ...answer.chapters].map((item) => item.sentence),
          1,
          count,
        );
        return missing === undefined
          ? Result.succeed(answer)
          : Result.fail(
              `sentence ${missing} does not exist; the sentences are 1 to ${count}`,
            );
      },
    );

/**
 * Asks with `prompt` and decodes the reply; when it does not decode, asks
 * once more with the error appended. The second failure is the answer's
 * failure.
 */
export const askTwice = <A, E, R>(
  ask: (prompt: string) => Effect.Effect<string, E, R>,
  prompt: string,
  decodeReply: (reply: string) => Result.Result<A, string>,
): Effect.Effect<Result.Result<A, string>, E, R> =>
  Effect.gen(function* () {
    const first = decodeReply(yield* ask(prompt));
    if (Result.isSuccess(first)) return first;
    return decodeReply(yield* ask(retryPrompt(prompt, first.failure)));
  });

/** Most sentences in one prompt, and how many neighbouring parts share. */
const CHUNK = 2500;
const OVERLAP = 20;

/** Sentences 1 to `count` in parts of at most `size`, each `overlap` into the one before. */
export const chunks = (
  count: number,
  size = CHUNK,
  overlap = OVERLAP,
): Array<{ readonly from: number; readonly to: number }> => {
  if (count <= size) return count === 0 ? [] : [{ from: 1, to: count }];
  const found: Array<{ from: number; to: number }> = [];
  for (let from = 1; ; from += size - overlap) {
    const to = Math.min(count, from + size - 1);
    found.push({ from, to });
    if (to === count) return found;
  }
};

const same = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** The text of each learning in learnings.md, without its `(<id>, <date>)`. */
const known = (file: string) =>
  file
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => same(line.slice(2).replace(/\s*\([^()]*\)\s*$/, '')));

/**
 * learnings.md with `learnings` appended as `- <text> (<id>, <date>)`,
 * skipping repeats; and which were added.
 */
export const learn = (
  file: string,
  learnings: ReadonlyArray<string>,
  id: string,
  date: string,
): { readonly file: string; readonly added: ReadonlyArray<string> } => {
  const seen = new Set(known(file));
  const added: Array<string> = [];
  for (const learning of learnings) {
    const text = learning.trim().replace(/\s+/g, ' ');
    if (text === '' || seen.has(same(text))) continue;
    seen.add(same(text));
    added.push(text);
  }
  if (added.length === 0) return { file, added };
  const lines = added.map((text) => `- ${text} (${id}, ${date})\n`).join('');
  const start = file === '' || file.endsWith('\n') ? file : `${file}\n`;
  return { file: start + lines, added };
};
