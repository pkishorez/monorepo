import { Effect, Layer, Schema, Stream } from 'effect';
import { AiClients } from '@kestack/ai-toolkit/client';
import { Page } from '@kestack/kabuki/routing';
import { Machines } from '../machines/index.ts';
import * as Project from './project/index.ts';

/*
 * The address of what is on one Machine, `/m/:machineId`: its projects and
 * their sessions. Everything else of the app is on every Machine at once,
 * at the root; this page only says which Machine the pages under it are
 * on.
 *
 * 1. Provide  the Machine's own `AiClient`, over its own socket, to the
 *             pages under it: a session is sent to, forked and asked on
 *             its own Machine. The socket opens only once the Machine is
 *             listed.
 * 2. Know     whether the signed-in Account's list has the Machine, so a
 *             Machine it no longer lists says so in place of the page.
 */

export const Machine = Page.define({
  path: '/m/:machineId',
  params: { machineId: Schema.String },
  requires: [Machines, AiClients],
  metadata: { title: 'code' },
  pages: { Project: Project.Page },
  model: Schema.Struct({
    /** Whether the Backend has answered and does not list it. */
    gone: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({ Known: { gone: Schema.Boolean } }),
});

export const MachineLive = Page.build(Machine, {
  init: () => ({ model: { gone: false } }),
  pages: { Project: Project.Live },
  // 1. Provide
  provides: (self) =>
    Layer.unwrap(
      Effect.map(self.get, ({ props }) =>
        AiClients.machine(props.params.machineId),
      ),
    ),
  // 2. Know
  workers: {
    known: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const { state } = yield* Machines;
          yield* Stream.runForEach(state, ({ machines, fetchedAt }) =>
            self.send({
              _tag: 'Known',
              gone:
                fetchedAt !== null &&
                machines?.some(({ id }) => id === props.params.machineId) !==
                  true,
            }),
          );
        }),
    },
  },
  on: { Known: ({ gone }) => ({ model: { gone } }) },
});
