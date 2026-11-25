import { Effect, Result } from 'effect';
import type { Range } from '../library/index.ts';
import {
  PAUSE_LIMITS,
  plan,
  sentences,
  totals,
  type Cut,
  type Sentence,
  type Word,
} from './edit/index.ts';
import {
  aboutOf,
  fail,
  remember,
  say,
  skillFile,
  workFiles,
  type Job,
} from './job.ts';
import {
  Claude,
  probe,
  readJson,
  writeJson,
  type Info,
} from './machine/index.ts';
import {
  askTwice,
  chunks,
  count,
  cutPrompt,
  decodeCuts,
  length,
  mergeCuts,
  stamp,
  took,
} from './text/index.ts';

/** Claude's cuts of `all`, part by part; a part whose answer cannot be read twice goes on without cuts. */
const askCuts = (job: Job, details: Info, all: ReadonlyArray<Sentence>) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const skill = {
      rules: yield* skillFile(job, 'cut-rules.md'),
      learnings: yield* skillFile(job, 'learnings.md'),
    };
    const parts = chunks(all.length);
    const found: Array<Cut> = [];
    const learnings: Array<string> = [];
    for (const [index, part] of parts.entries()) {
      const prompt = cutPrompt({
        skill,
        strength: job.strength,
        about: aboutOf(details),
        sentences: all.slice(part.from - 1, part.to),
        part:
          parts.length === 1 ? null : { index: index + 1, count: parts.length },
      });
      const answer = yield* askTwice(
        claude.ask,
        prompt,
        decodeCuts(part.from, part.to),
      );
      if (Result.isFailure(answer)) {
        yield* say(
          job,
          'clean-up',
          `warning: Claude's answer could not be read twice (${answer.failure}); going on without its cuts${parts.length === 1 ? '' : ` for sentences ${part.from}–${part.to}`}`,
          'ads',
        );
        continue;
      }
      found.push(...answer.success.cuts);
      learnings.push(...answer.success.learnings);
    }
    const cuts = mergeCuts(found).filter(
      (cut) => job.strength !== 'light' || cut.kind !== 'filler-talk',
    );
    return { cuts, learnings };
  });

/**
 * Sentences from words → `work/sentences.json`; Claude's cuts; then the
 * plan of what is kept → `work/plan.json` and `cuts.json`.
 */
export const cleanUp = (job: Job) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const words = (yield* readJson(files.words)) as ReadonlyArray<Word>;
    if (words.length === 0)
      return yield* fail(
        'No words were heard in this video, so there is nothing to keep.',
      );
    const details = (yield* readJson(files.info)) as Info;
    const silences = (yield* readJson(files.silences)) as ReadonlyArray<Range>;
    const original = yield* probe(job.files.original);
    const all = sentences(words);
    yield* writeJson(files.sentences, all);
    yield* say(
      job,
      'clean-up',
      `Claude: reading ${count(all.length)} sentences for ads${job.strength === 'light' ? '' : ' and filler talk'}…`,
      'ads',
    );
    const { cuts, learnings } = yield* askCuts(job, details, all);
    yield* remember(job, 'clean-up', learnings);
    const made = plan({
      words,
      sentences: all,
      cuts,
      silences,
      strength: job.strength,
      duration: original.duration,
      fps: original.fps,
      origin: original.videoStart,
    });
    if (made.kept.length === 0)
      return yield* fail('The plan keeps nothing of this video.');
    yield* writeJson(files.plan, made);
    yield* writeJson(job.files.cuts, {
      kept: made.kept,
      removed: made.removed,
    });
    const removed = totals(made.removed);
    const counted = (kind: string) =>
      made.removed.filter((gone) => gone.kind === kind).length;
    yield* say(
      job,
      'clean-up',
      `${count(counted('silence'))} pauses over ${PAUSE_LIMITS[job.strength]} s → ${took(removed.silence)} removed`,
      'silence',
    );
    yield* say(
      job,
      'clean-up',
      `${count(counted('fillers'))} sounds that aren't words → ${took(removed.fillers)} removed`,
      'fillers',
    );
    for (const cut of cuts)
      yield* say(
        job,
        'clean-up',
        `cut ${stamp(all[cut.from - 1]!.start)}–${stamp(all[cut.to - 1]!.end)}  ${cut.reason}`,
        cut.kind === 'filler-talk' ? 'filler talk' : 'ads',
      );
    const shorter = Math.round((1 - made.length / made.duration) * 100);
    yield* say(
      job,
      'clean-up',
      `${length(made.duration)} → ${length(made.length)} (${shorter}% shorter), ${count(made.removed.length)} cuts`,
      'plan',
    );
    yield* job.update({
      result: { duration: made.length, removed, cuts: made.removed.length },
    });
  });
