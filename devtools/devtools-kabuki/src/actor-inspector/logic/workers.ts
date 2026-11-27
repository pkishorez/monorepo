import { Effect, Schedule, Stream } from 'effect';
import type { DataOf, WorkersOf } from '@kestack/kabuki/types';
import type {
  Cursor,
  Entry,
  Told,
} from '../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../services/kabuki-session/contract/index.ts';
import { problemOf } from './commands.ts';
import type { InspectorShape, Step } from './shared/index.ts';

const TICK = 1400;

const AGAIN = Schedule.spaced('2 seconds');

const HEAD = 'head';

const stepKey = ({ model }: DataOf<typeof InspectorShape>) =>
  model.now === null
    ? undefined
    : `${model.epoch}|${model.shown ?? `${HEAD}#${model.now.revision}`}`;

const keyedStep = (key: string): Step | undefined => {
  const shown = key.slice(key.indexOf('|') + 1);
  return shown.startsWith(HEAD)
    ? undefined
    : shown === 'start'
      ? 'start'
      : Number(shown);
};

interface Held {
  readonly epoch: string;
  readonly entries: ReadonlyArray<Entry>;
}

const heldAfter = (held: Held, batch: Told): Held => {
  const all =
    batch.epoch === held.epoch
      ? [...held.entries, ...batch.entries]
      : batch.entries;
  const roots = new Set(batch.roots);
  const grown = new Set<number>();
  const entries = all.flatMap((entry) => {
    if (roots.has(entry.id)) {
      grown.add(entry.id);
      return [{ ...entry, parent: null }];
    }
    if (entry.parent === null || !grown.has(entry.parent)) return [];
    grown.add(entry.id);
    return [entry];
  });
  return { epoch: batch.epoch, entries };
};

export const workers: WorkersOf<typeof InspectorShape> = {
  history: {
    run: (self) =>
      Effect.gen(function* () {
        const session = yield* KabukiSession;
        let held: Held = { epoch: '', entries: [] };
        let cursor: Cursor | undefined;
        const follow = Effect.suspend(() =>
          session.history(cursor ? { from: cursor } : {}).pipe(
            Stream.runForEach((batch) => {
              held = heldAfter(held, batch);
              cursor = {
                epoch: batch.epoch,
                after: held.entries.reduce<number | null>(
                  (newest, { id }) =>
                    newest === null || id > newest ? id : newest,
                  null,
                ),
              };
              return self.send({
                _tag: 'Heard',
                now: batch.now,
                epoch: batch.epoch,
                entries: held.entries,
              });
            }),
          ),
        );
        yield* follow.pipe(
          Effect.tapError((error) =>
            self.send({ _tag: 'Failed', problem: problemOf(error) }),
          ),
          Effect.retry(AGAIN),
          Effect.catch(() => Effect.void),
        );
      }),
  },
  step: {
    each: (data) => {
      const key = stepKey(data);
      return key === undefined ? [] : [key];
    },
    run: (self, key) =>
      Effect.flatMap(KabukiSession, (session) => {
        const at = keyedStep(key);
        return session.step(at === undefined ? {} : { at });
      }).pipe(
        Effect.matchEffect({
          onSuccess: (stepped) => self.send({ _tag: 'Read', stepped }),
          onFailure: (error) =>
            self.send({ _tag: 'Failed', problem: problemOf(error) }),
        }),
      ),
  },
  play: {
    each: ({ model }) => (model.playing ? [`${model.shown ?? 'head'}`] : []),
    run: (self) =>
      Effect.sleep(TICK).pipe(Effect.andThen(self.send({ _tag: 'Ticked' }))),
  },
};
