import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { PROJECTS, Routes } from '../../routes/index.ts';

/**
 * Where a signed-in user lands. Its Worker runs for exactly as long as the
 * dashboard is open, and its one Message that moves the app does it from an
 * Update, with a Command.
 */
export const DashboardActor = Actor.make('Dashboard', {
  requires: [Navigation],
  props: Routes.Dashboard.props,
  model: Schema.Struct({ ticks: Schema.Number }),
  message: Schema.TaggedUnion({ Ticked: {}, SurpriseClicked: {} }),
}).build({
  init: () => ({ model: { ticks: 0 } }),
  workers: {
    live: {
      run: (self) =>
        Effect.forever(
          Effect.sleep('1 second').pipe(
            Effect.andThen(self.send({ _tag: 'Ticked' })),
          ),
        ),
    },
  },
  on: {
    Ticked: (_, { model }) => ({ model: { ticks: model.ticks + 1 } }),
    SurpriseClicked: (_, { model }) => ({
      command: Router.push(
        Routes.Projects.Project({
          id: PROJECTS[model.ticks % PROJECTS.length]!.id,
        }),
      ),
    }),
  },
});
