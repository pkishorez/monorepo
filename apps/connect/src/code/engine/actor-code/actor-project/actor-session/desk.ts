import { Context, Effect } from 'effect';
import {
  HarnessBinaries,
  Harnesses,
  Titler,
} from '@kestack/ai-toolkit/harness';
import type { Json } from '@kestack/ai-toolkit/contract';
import { Store } from '../../../services/store/index.js';
import { AskFailed, Desks, type Desk } from '../../../capabilities/index.js';
import type { SessionSelf } from './actor.js';
import { forkFrom } from './fork.js';
import { makeAgent } from './services/index.js';
import { retitle } from './title.js';

/*
 * The desk Worker: opens the Session's agent on first use, with the
 * Session's model and settings as they are then, and puts the Desk out for
 * as long as the Session lives. The engine's questions and the Session's
 * other Workers meet the agent here.
 */

const ask = (self: SessionSelf, question: string, schema: Json | null) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const { harness, nativeId, model: languageModel } = model.session;
    if (nativeId === null)
      return yield* new AskFailed({
        message:
          'This session has no context to ask about yet; wait for its first turn to start.',
      });
    const harnesses = yield* Harnesses;
    return yield* harnesses
      .get(harness)
      .ask({
        cwd: model.cwd,
        nativeId,
        model: languageModel,
        question,
        ...(schema === null ? {} : { schema }),
      })
      .pipe(
        Effect.mapError((error) => new AskFailed({ message: error.message })),
      );
  });

export const desk = (self: SessionSelf) =>
  Effect.gen(function* () {
    const harnesses = yield* Harnesses;
    // Only the services, never this Worker's Scope: the agent has its own.
    const services = Context.empty().pipe(
      Context.add(Store, yield* Store),
      Context.add(Harnesses, harnesses),
      Context.add(HarnessBinaries, yield* HarnessBinaries),
      Context.add(Titler, yield* Titler),
    );
    const { model } = yield* self.get;
    const harness = harnesses.get(model.session.harness);
    const agent = yield* makeAgent(
      Effect.flatMap(self.get, ({ model }) =>
        harness.open({
          cwd: model.cwd,
          model: model.session.model,
          settings: model.session.settings,
          ...(model.session.nativeId === null
            ? {}
            : { nativeId: model.session.nativeId }),
        }),
      ).pipe(Effect.provideContext(services)),
    );
    const out: Desk = {
      agent: agent.get,
      opened: agent.opened,
      fork: (afterTurnId) =>
        forkFrom(self, afterTurnId).pipe(Effect.provideContext(services)),
      retitle: retitle(self).pipe(Effect.provideContext(services)),
      ask: (question, schema) =>
        ask(self, question, schema).pipe(Effect.provideContext(services)),
      reset: agent.reset,
      jobs: agent.jobs,
      nextAgentTurn: agent.nextAgentTurn,
      takeAgentTurn: agent.takeAgentTurn,
    };
    yield* (yield* Desks).put(model.session.id, out);
    yield* Effect.never;
  });
