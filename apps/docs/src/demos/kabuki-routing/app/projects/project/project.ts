import { Effect, Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { PROJECTS } from '../../../routes/index.ts';
import { Share, ShareLive } from './share/index.ts';

/**
 * One project, keyed by its id: another id is a fresh Instance, and its
 * `presence` count starts over. Its share dialog is a page under it, so the
 * project stays while the dialog is open over it, and the count goes on.
 */
export const Project = Page.define({
  path: '/:id',
  params: { id: Schema.FiniteFromString },
  // The title is the project's name, worked out from the Route alone.
  metadata: ({ id }) => ({
    title: `${PROJECTS.find((each) => each.id === id)?.name ?? `Project ${id}`} · Acme`,
  }),
  pages: { Share },
  model: Schema.Struct({ seen: Schema.Number }),
  message: Schema.TaggedUnion({ Seen: {} }),
});

export const ProjectLive = Page.build(Project, {
  pages: { Share: ShareLive },
  init: () => ({ model: { seen: 0 } }),
  workers: {
    presence: {
      run: (self) =>
        Effect.forever(
          Effect.sleep('1 second').pipe(
            Effect.andThen(self.send({ _tag: 'Seen' })),
          ),
        ),
    },
  },
  on: {
    Seen: (_, { model }) => ({ model: { seen: model.seen + 1 } }),
  },
});
