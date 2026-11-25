import { Effect, Stream } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import { problemOf, shownOf } from './shared/index.ts';
import type { RunningShape, Step } from './shared/index.ts';

const TICK = 1400;

const HEAD = 'head#';

const lookKey = (shown: Step | null, revision: number) =>
  shown === null ? `${HEAD}${revision}` : `${shown}`;

const stepOf = (key: string): Step | undefined =>
  key.startsWith(HEAD) ? undefined : key === 'start' ? 'start' : Number(key);

export const workers: WorkersOf<typeof RunningShape> = {
  print: {
    while: ({ model }) => model.print === null,
    run: (self) =>
      Effect.flatMap(KabukiSession, (session) => session.blueprint()).pipe(
        Effect.matchEffect({
          onSuccess: ({ root }) => self.send({ _tag: 'Printed', root }),
          onFailure: (error) =>
            self.send({ _tag: 'Failed', problem: problemOf(error) }),
        }),
      ),
  },
  watch: {
    run: (self) =>
      Effect.flatMap(KabukiSession, (session) =>
        session
          .watch()
          .pipe(
            Stream.runForEach(({ now, entries }) =>
              self.send({ _tag: 'Heard', now, entries }),
            ),
          ),
      ).pipe(
        Effect.catch((error) =>
          self.send({ _tag: 'Failed', problem: problemOf(error) }),
        ),
      ),
  },
  look: {
    each: (data) =>
      data.model.now === null
        ? []
        : [lookKey(shownOf(data), data.model.now.revision)],
    run: (self, key) =>
      Effect.flatMap(KabukiSession, (session) => {
        const at = stepOf(key);
        return session.look(at === undefined ? { open: [] } : { at, open: [] });
      }).pipe(
        Effect.matchEffect({
          onSuccess: (look) => self.send({ _tag: 'Looked', look }),
          onFailure: (error) =>
            self.send({ _tag: 'Failed', problem: problemOf(error) }),
        }),
      ),
  },
  play: {
    each: (data) => (data.model.playing ? [`${shownOf(data) ?? 'head'}`] : []),
    run: (self) =>
      Effect.sleep(TICK).pipe(Effect.andThen(self.send({ _tag: 'Ticked' }))),
  },
};
