/**
 * Turns the downloads of a model's files into one picture of the model
 * loading: bytes summed across files, then ready.
 */
import { Stream } from 'effect';
import type { Loading, Recognizer } from './engine.ts';

/** What an engine emits while loading: a file's download state, or the model. */
export type LoadStep =
  | {
      readonly _tag: 'File';
      readonly url: string;
      readonly loaded: number;
      readonly total: number;
      readonly fetched: number;
    }
  | { readonly _tag: 'Ready'; readonly recognizer: Recognizer };

type Files = ReadonlyMap<string, Extract<LoadStep, { _tag: 'File' }>>;

/** Folds load steps into loading states against the model's listed size. */
export const toLoading =
  (expectedBytes: number) =>
  <E>(steps: Stream.Stream<LoadStep, E>): Stream.Stream<Loading, E> =>
    steps.pipe(
      Stream.mapAccum(
        (): Files => new Map(),
        (files: Files, step: LoadStep) => {
          if (step._tag === 'Ready') {
            return [files, [step as Loading]] as const;
          }
          const next: Files = new Map(files).set(step.url, step);
          let loaded = 0;
          let total = 0;
          let fetched = 0;
          for (const file of next.values()) {
            loaded += file.loaded;
            total += file.total;
            fetched += file.fetched;
          }
          // Until every file has reported its size, the listed size stands in.
          const known = Math.max(total, expectedBytes);
          const loading: Loading = {
            _tag: 'Downloading',
            progress: {
              loaded: Math.min(loaded, known),
              total: known,
              fetched,
            },
          };
          return [next, [loading]] as const;
        },
      ),
    );
